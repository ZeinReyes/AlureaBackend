import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  ScanCommand,
  UpdateCommand,
  DeleteCommand
} from "@aws-sdk/lib-dynamodb";

const router = express.Router();

// DynamoDB client
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const ORDERS_TABLE = "Orders";
const PRODUCTS_TABLE = "Products";

// Multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/proofs/';
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `proof-${uniqueSuffix}${ext}`);
  }
});
const upload = multer({ storage });

// ---------------- Create Order ----------------
router.post('/', async (req, res) => {
  try {
    const { name, address, contact, payment_method, items, totalAmount, latitude, longitude } = req.body;

    const newOrder = {
      id: uuidv4(),
      name,
      address,
      contact,
      payment_method,
      items,
      totalAmount: parseFloat(totalAmount),
      status: 'Pending',
      date: new Date().toISOString(),
      latitude,
      longitude,
    };

    await dynamo.send(new PutCommand({
      TableName: ORDERS_TABLE,
      Item: newOrder,
    }));

    // Decrement stock for each product
    for (const item of items) {
      await dynamo.send(new UpdateCommand({
        TableName: PRODUCTS_TABLE,
        Key: { id: item.id },
        UpdateExpression: "SET stock = stock - :quantity",
        ExpressionAttributeValues: { ":quantity": item.quantity },
      }));
    }

    res.status(201).json({ message: 'Order placed and stock updated successfully', order: newOrder });
  } catch (error) {
    console.error('Order saving error:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ---------------- Get all orders ----------------
router.get('/', async (req, res) => {
  try {
    const result = await dynamo.send(new ScanCommand({ TableName: ORDERS_TABLE }));
    const orders = (result.Items || []).sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch orders', error: err.message });
  }
});

// ---------------- Track order by ID ----------------
router.get('/track-order/:orderId', async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const result = await dynamo.send(new GetCommand({
      TableName: ORDERS_TABLE,
      Key: { id: orderId },
    }));

    if (!result.Item) return res.status(404).json({ message: 'Order not found' });

    res.json(result.Item);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch order details', error: err.message });
  }
});

// ---------------- Delete order ----------------
router.delete('/:id', async (req, res) => {
  try {
    await dynamo.send(new DeleteCommand({
      TableName: ORDERS_TABLE,
      Key: { id: req.params.id },
    }));

    res.json({ message: 'Order deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete order', error: err.message });
  }
});

// ---------------- Update order to Delivering ----------------
router.patch('/:id/deliver', async (req, res) => {
  try {
    const result = await dynamo.send(new UpdateCommand({
      TableName: ORDERS_TABLE,
      Key: { id: req.params.id },
      UpdateExpression: "SET #status = :status",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": "Delivering" },
      ReturnValues: "ALL_NEW",
    }));

    if (!result.Attributes) return res.status(404).json({ message: 'Order not found' });

    res.json(result.Attributes);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update order status', error: err.message });
  }
});

// ---------------- Upload delivery proof ----------------
router.post('/:id/deliver-proof', upload.single('photo'), async (req, res) => {
  try {
    const result = await dynamo.send(new UpdateCommand({
      TableName: ORDERS_TABLE,
      Key: { id: req.params.id },
      UpdateExpression: "SET #status = :status, proofPhoto = :photo",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": "Delivered",
        ":photo": req.file.filename
      },
      ReturnValues: "ALL_NEW",
    }));

    if (!result.Attributes) return res.status(404).json({ message: 'Order not found' });

    res.json(result.Attributes);
  } catch (err) {
    console.error('Error uploading delivery proof:', err);
    res.status(500).json({ message: 'Failed to upload delivery proof', error: err.message });
  }
});

export default router;
