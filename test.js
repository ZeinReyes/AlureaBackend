import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

const client = new MongoClient(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });

async function test() {
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB Atlas!');
    await client.db('test').command({ ping: 1 });
    console.log('🏓 Ping successful');
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
  } finally {
    await client.close();
  }
}

test();
