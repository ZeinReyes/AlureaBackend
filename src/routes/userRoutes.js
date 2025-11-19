import express from 'express';
import {
  createUser,
  getUser,
  getUserById,
  updateUser,
  deleteUser,
  updateProfile
} from '../controllers/userController.js';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const router = express.Router();
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const USER_LOGS_TABLE = "UserLogs";

// ---------------- User routes ----------------
router.route('/')
  .get(getUser)
  .post(createUser);

// ---------------- Logs ----------------
router.get('/logs/all', async (req, res) => {
  try {
    const result = await dynamo.send(new ScanCommand({ TableName: USER_LOGS_TABLE }));
    const logs = (result.Items || []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch logs', error: err.message });
  }
});

// ---------------- Update profile ----------------
router.put('/update-profile', updateProfile);

// ---------------- User by ID routes ----------------
router.route('/:id')
  .get(getUserById)
  .put(updateUser)
  .delete(deleteUser);

export default router;
