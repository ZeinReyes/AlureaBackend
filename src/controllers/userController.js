import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
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

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const USERS_TABLE = "Users";
const USER_LOGS_TABLE = "UserLogs";

// ---------------- Create User ----------------
export const createUser = async (req, res) => {
  const { name, email, password, role } = req.body;

  try {
    // Check if user exists
    const users = await dynamo.send(new ScanCommand({
      TableName: USERS_TABLE,
      FilterExpression: "#email = :email",
      ExpressionAttributeNames: { "#email": "email" },
      ExpressionAttributeValues: { ":email": email },
    }));
    if (users.Items?.length) return res.status(400).json({ message: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: uuidv4(),
      name,
      email,
      password: hashedPassword,
      role,
      createdAt: new Date().toISOString(),
    };

    await dynamo.send(new PutCommand({ TableName: USERS_TABLE, Item: newUser }));

    await dynamo.send(new PutCommand({
      TableName: USER_LOGS_TABLE,
      Item: {
        id: uuidv4(),
        action: 'CREATE_USER',
        performedBy: email,
        targetUser: email,
        details: `User ${name} created with role ${role}`,
        timestamp: new Date().toISOString(),
      }
    }));

    res.status(201).json(newUser);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create user', error: err.message });
  }
};

// ---------------- Get All Users ----------------
export const getUser = async (req, res) => {
  try {
    const result = await dynamo.send(new ScanCommand({ TableName: USERS_TABLE }));
    res.json(result.Items || []);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch users', error: err.message });
  }
};

// ---------------- Get User by ID ----------------
export const getUserById = async (req, res) => {
  try {
    const result = await dynamo.send(new GetCommand({ TableName: USERS_TABLE, Key: { id: req.params.id } }));
    if (!result.Item) return res.status(404).json({ message: 'User not found' });
    res.json(result.Item);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch user', error: err.message });
  }
};

// ---------------- Update User ----------------
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await dynamo.send(new GetCommand({ TableName: USERS_TABLE, Key: { id } }));
    const user = result.Item;
    if (!user) return res.status(404).json({ message: 'User not found' });

    const originalRole = user.role;
    const updates = { ...req.body };

    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }

    const updateExp = "SET " + Object.keys(updates).map(k => `#${k} = :${k}`).join(", ");
    const exprAttrNames = Object.fromEntries(Object.keys(updates).map(k => [`#${k}`, k]));
    const exprAttrValues = Object.fromEntries(Object.entries(updates).map(([k, v]) => [`:${k}`, v]));

    const updated = await dynamo.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { id },
      UpdateExpression: updateExp,
      ExpressionAttributeNames: exprAttrNames,
      ExpressionAttributeValues: exprAttrValues,
      ReturnValues: "ALL_NEW"
    }));

    // Log role change
    if (updates.role && updates.role !== originalRole) {
      await dynamo.send(new PutCommand({
        TableName: USER_LOGS_TABLE,
        Item: {
          id: uuidv4(),
          action: 'UPDATE_USER_ROLE',
          performedBy: req.body.adminEmail || 'unknown',
          targetUser: user.email,
          details: `Changed role from ${originalRole} to ${updates.role}`,
          timestamp: new Date().toISOString(),
        }
      }));
    }

    res.json(updated.Attributes);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update user', error: err.message });
  }
};

// ---------------- Delete User ----------------
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await dynamo.send(new GetCommand({ TableName: USERS_TABLE, Key: { id } }));
    if (!result.Item) return res.status(404).json({ message: 'User not found' });

    await dynamo.send(new DeleteCommand({ TableName: USERS_TABLE, Key: { id } }));

    await dynamo.send(new PutCommand({
      TableName: USER_LOGS_TABLE,
      Item: {
        id: uuidv4(),
        action: 'DELETE_USER',
        performedBy: req.body.adminEmail || 'unknown',
        targetUser: result.Item.email,
        details: `Deleted user ${result.Item.name}`,
        timestamp: new Date().toISOString(),
      }
    }));

    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete user', error: err.message });
  }
};

// ---------------- Update Profile ----------------
export const updateProfile = async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { id } = decoded;

    const result = await dynamo.send(new GetCommand({ TableName: USERS_TABLE, Key: { id } }));
    const user = result.Item;
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { name, email, password, confirmPassword } = req.body;
    const updates = {};

    if (name && name !== user.name) updates.name = name;

    if (email && email !== user.email) {
      const existingUsers = await dynamo.send(new ScanCommand({
        TableName: USERS_TABLE,
        FilterExpression: "#email = :email",
        ExpressionAttributeNames: { "#email": "email" },
        ExpressionAttributeValues: { ":email": email },
      }));
      if (existingUsers.Items?.length && existingUsers.Items[0].id !== id) {
        return res.status(400).json({ message: 'Email already in use' });
      }
      updates.email = email;
    }

    if (password) {
      if (password !== confirmPassword) return res.status(400).json({ message: 'Passwords do not match' });
      updates.password = await bcrypt.hash(password, 10);
    }

    if (Object.keys(updates).length > 0) {
      const updateExp = "SET " + Object.keys(updates).map(k => `#${k} = :${k}`).join(", ");
      const exprAttrNames = Object.fromEntries(Object.keys(updates).map(k => [`#${k}`, k]));
      const exprAttrValues = Object.fromEntries(Object.entries(updates).map(([k, v]) => [`:${k}`, v]));

      const updatedUser = await dynamo.send(new UpdateCommand({
        TableName: USERS_TABLE,
        Key: { id },
        UpdateExpression: updateExp,
        ExpressionAttributeNames: exprAttrNames,
        ExpressionAttributeValues: exprAttrValues,
        ReturnValues: "ALL_NEW"
      }));

      return res.json({ updatedUser: updatedUser.Attributes });
    }

    res.json({ message: 'No changes made' });
  } catch (err) {
    res.status(401).json({ message: 'Invalid token', error: err.message });
  }
};
