import express from 'express';
import AWS from 'aws-sdk';

const router = express.Router();

// Configure DynamoDB
const dynamoDb = new AWS.DynamoDB.DocumentClient({ region: 'ap-southeast-1' });
const USERS_TABLE = process.env.USERS_TABLE || 'Users';

router.get('/location/:userId', async (req, res) => {
    const { userId } = req.params;

    const params = {
        TableName: USERS_TABLE,
        Key: { id: userId },
    };

    try {
        const result = await dynamoDb.get(params).promise();

        if (!result.Item) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = result.Item;

        if (user.role !== 'rider') {
            return res.status(403).json({ message: 'User is not a rider' });
        }

        return res.json({
            lat: user.latitude,
            lon: user.longitude
        });
    } catch (err) {
        console.error("Error fetching user location:", err);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});

export default router;
