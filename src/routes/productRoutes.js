import express from 'express';
import {
    createProduct,
    getProducts,
    getProductById,
    updateProduct,
    deleteProduct
} from '../controllers/productController.js';

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const router = express.Router();

// DynamoDB client for logs
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const PRODUCT_LOGS_TABLE = "ProductLogs";

// Routes
router.route('/')
    .get(getProducts)
    .post(createProduct);

// Logs route
router.get('/logs/all', async (req, res) => {
    try {
        const result = await dynamo.send(new ScanCommand({
            TableName: PRODUCT_LOGS_TABLE,
        }));

        // Sort by timestamp descending
        const logs = (result.Items || []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json(logs);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch logs', error: err.message });
    }
});

router.route('/:id')
    .get(getProductById)
    .put(updateProduct)
    .delete(deleteProduct);

export default router;
