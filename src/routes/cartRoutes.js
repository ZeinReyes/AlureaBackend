import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const router = express.Router();

// DynamoDB client
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const CARTS_TABLE = "Carts";

// ---------------- Get cart by userId ----------------
router.get('/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const result = await dynamo.send(new GetCommand({
      TableName: CARTS_TABLE,
      Key: { userId },
    }));

    res.json(result.Item ? result.Item.items : []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- Save/update cart ----------------
router.post('/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const { items } = req.body;

    const result = await dynamo.send(new GetCommand({
      TableName: CARTS_TABLE,
      Key: { userId },
    }));

    const cartItem = {
      userId,
      items,
      updatedAt: new Date().toISOString(),
    };

    // If no existing cart, create new item
    if (!result.Item) {
      cartItem.id = uuidv4(); // optional, if you want a unique id for internal use
    }

    await dynamo.send(new PutCommand({
      TableName: CARTS_TABLE,
      Item: cartItem,
    }));

    res.json({ message: 'Cart saved successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
