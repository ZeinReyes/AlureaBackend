import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

// ---------------- AWS Clients ----------------
const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);

// ---------------- Constants ----------------
const USER_TABLE = "Users";

// ---------------- Register ----------------
export const register = async (req, res) => {
  const { name, email, password } = req.body;

  try {
    // 1️⃣ Cognito signup
    const command = new SignUpCommand({
      ClientId: process.env.COGNITO_CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [{ Name: "name", Value: name }],
    });
    await cognito.send(command);

    // 2️⃣ Save to DynamoDB if not existing
    const scanResult = await dynamoDB.send(
      new ScanCommand({
        TableName: USER_TABLE,
        FilterExpression: "#email = :email",
        ExpressionAttributeNames: { "#email": "email" },
        ExpressionAttributeValues: { ":email": email },
      })
    );

    if (scanResult.Items?.length === 0) {
      await dynamoDB.send(
        new PutCommand({
          TableName: USER_TABLE,
          Item: {
            id: uuidv4(),
            email,
            name,
            role: "client",
            isEmailVerified: false,
            createdAt: new Date().toISOString(),
          },
        })
      );
    }

    res.status(201).json({
      message: "Registration successful. Verify email via Cognito.",
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(400).json({ message: error.message });
  }
};

// ---------------- Verify Email (Cognito OTP during registration) ----------------
export const verifyEmailCognito = async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ message: "Email and code are required." });
  }

  try {
    await cognito.send(
      new ConfirmSignUpCommand({
        ClientId: process.env.COGNITO_CLIENT_ID,
        Username: email,
        ConfirmationCode: code,
      })
    );

    // Update DynamoDB
    const scanResult = await dynamoDB.send(
      new ScanCommand({
        TableName: USER_TABLE,
        FilterExpression: "#email = :email",
        ExpressionAttributeNames: { "#email": "email" },
        ExpressionAttributeValues: { ":email": email },
      })
    );

    const user = scanResult.Items?.[0];
    if (!user) return res.status(404).json({ message: "User not found in DynamoDB" });

    await dynamoDB.send(
      new UpdateCommand({
        TableName: USER_TABLE,
        Key: { id: user.id },
        UpdateExpression: "set isEmailVerified = :verified",
        ExpressionAttributeValues: { ":verified": true },
      })
    );

    res.status(200).json({ message: "Email verified successfully!" });
  } catch (error) {
    console.error("Email verification error:", error);
    res.status(400).json({ message: error.message });
  }
};

// ---------------- Login (NO OTP ANYMORE) ----------------
export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const command = new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: process.env.COGNITO_CLIENT_ID,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    });

    const response = await cognito.send(command);

    // get Cognito token
    const accessToken = response.AuthenticationResult.AccessToken;

    // get user from DynamoDB
    const scanResult = await dynamoDB.send(
      new ScanCommand({
        TableName: USER_TABLE,
        FilterExpression: "#email = :email",
        ExpressionAttributeNames: { "#email": "email" },
        ExpressionAttributeValues: { ":email": email },
      })
    );

    const user = scanResult.Items?.[0];
    if (!user) return res.status(404).json({ message: "User not found" });

    // create your own JWT
    const token = jwt.sign(
      { email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    const redirectUrl = user.role === "admin" ? "/admin" : "/client";

    res.status(200).json({
      message: "Login successful.",
      token,
      redirectUrl,
      user: {
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(400).json({ message: error.message });
  }
};

// ---------------- Update Profile ----------------
export const updateProfile = async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const email = decoded.email;

    const scanResult = await dynamoDB.send(
      new ScanCommand({
        TableName: USER_TABLE,
        FilterExpression: "#email = :email",
        ExpressionAttributeNames: { "#email": "email" },
        ExpressionAttributeValues: { ":email": email },
      })
    );

    const user = scanResult.Items?.[0];
    if (!user) return res.status(404).json({ message: "User not found" });

    const { name, password, confirmPassword } = req.body;

    const updates = {};

    if (name && name !== user.name) updates.name = name;
    if (password) {
      if (password !== confirmPassword)
        return res.status(400).json({ message: "Passwords do not match" });

      updates.password = await bcrypt.hash(password, 10);
    }

    if (Object.keys(updates).length > 0) {
      await dynamoDB.send(
        new UpdateCommand({
          TableName: USER_TABLE,
          Key: { id: user.id },
          UpdateExpression:
            "SET " +
            Object.keys(updates)
              .map((k) => `#${k} = :${k}`)
              .join(", "),
          ExpressionAttributeNames: Object.fromEntries(
            Object.keys(updates).map((k) => [`#${k}`, k])
          ),
          ExpressionAttributeValues: Object.fromEntries(
            Object.entries(updates).map(([k, v]) => [`:${k}`, v])
          ),
        })
      );
    }

    res.json({ message: "Profile updated successfully" });
  } catch (err) {
    res.status(401).json({ message: "Invalid token", error: err.message });
  }
};
