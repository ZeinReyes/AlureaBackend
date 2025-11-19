import { v4 as uuidv4 } from "uuid";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

const PRODUCTS_TABLE = "Products";
const PRODUCT_LOGS_TABLE = "ProductLogs";

const dynamo = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION })
);

// 🟢 Get all products (Scan)
export const getProducts = async (req, res) => {
  try {
    const result = await dynamo.send(
      new ScanCommand({ TableName: PRODUCTS_TABLE })
    );
    res.json(result.Items || []);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch products", error: err.message });
  }
};

// 🟢 Get product by ID
export const getProductById = async (req, res) => {
  try {
    const result = await dynamo.send(
      new GetCommand({
        TableName: PRODUCTS_TABLE,
        Key: { id: req.params.id },
      })
    );

    if (!result.Item) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(result.Item);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch product", error: err.message });
  }
};

// 🟢 Create new product
export const createProduct = async (req, res) => {
  const { name, description, type, material, price, stock, adminEmail } = req.body;

  try {
    const newProduct = {
      id: uuidv4(),
      name,
      description,
      type,
      material,
      price: parseFloat(price),
      stock: parseInt(stock),
      createdAt: new Date().toISOString(),
    };

    await dynamo.send(
      new PutCommand({
        TableName: PRODUCTS_TABLE,
        Item: newProduct,
      })
    );

    // Log creation
    try {
      await dynamo.send(
        new PutCommand({
          TableName: PRODUCT_LOGS_TABLE,
          Item: {
            id: uuidv4(),
            action: "CREATE_PRODUCT",
            performedBy: adminEmail || "Unknown Admin",
            targetProduct: newProduct.name,
            details: `Created product "${newProduct.name}" (${newProduct.type}).`,
            timestamp: new Date().toISOString(),
          },
        })
      );
    } catch (logError) {
      console.error("Logging failed:", logError.message);
    }

    res.status(201).json(newProduct);
  } catch (err) {
    res.status(500).json({ message: "Failed to create product", error: err.message });
  }
};

// 🟢 Update existing product
export const updateProduct = async (req, res) => {
  try {
    // Fetch existing
    const result = await dynamo.send(
      new GetCommand({
        TableName: PRODUCTS_TABLE,
        Key: { id: req.params.id },
      })
    );

    const product = result.Item;
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const originalProduct = { ...product };

    // Update fields
    const updatedFields = {
      ...product,
      ...req.body,
      price: req.body.price ? parseFloat(req.body.price) : product.price,
      stock: req.body.stock ? parseInt(req.body.stock) : product.stock,
    };

    await dynamo.send(
      new PutCommand({
        TableName: PRODUCTS_TABLE,
        Item: updatedFields,
      })
    );

    // Track changes
    const performedBy = req.body.adminEmail || "Unknown Admin";
    const changes = [];

    if (req.body.name && req.body.name !== originalProduct.name) {
      changes.push(`Name: changed from "${originalProduct.name}" to "${req.body.name}"`);
    }
    if (req.body.price && req.body.price !== originalProduct.price) {
      changes.push(`Price: changed from ₱${originalProduct.price} to ₱${req.body.price}`);
    }
    if (req.body.stock && req.body.stock !== originalProduct.stock) {
      changes.push(`Stock: changed from ${originalProduct.stock} to ${req.body.stock}`);
    }
    if (req.body.type && req.body.type !== originalProduct.type) {
      changes.push(`Type: changed from "${originalProduct.type}" to "${req.body.type}"`);
    }
    if (req.body.material && req.body.material !== originalProduct.material) {
      changes.push(`Material: changed from "${originalProduct.material}" to "${req.body.material}"`);
    }

    const detailMessage =
      changes.length > 0
        ? changes.join(", ")
        : `Product "${originalProduct.name}" was updated (no significant changes).`;

    // Log update
    try {
      await dynamo.send(
        new PutCommand({
          TableName: PRODUCT_LOGS_TABLE,
          Item: {
            id: uuidv4(),
            action: "UPDATE_PRODUCT",
            performedBy,
            targetProduct: updatedFields.name,
            details: detailMessage,
            timestamp: new Date().toISOString(),
          },
        })
      );
    } catch (logError) {
      console.error("Logging failed:", logError.message);
    }

    res.json(updatedFields);
  } catch (err) {
    res.status(500).json({ message: "Failed to update product", error: err.message });
  }
};

// 🟢 Delete product
export const deleteProduct = async (req, res) => {
  try {
    // Find product first
    const result = await dynamo.send(
      new GetCommand({
        TableName: PRODUCTS_TABLE,
        Key: { id: req.params.id },
      })
    );

    const product = result.Item;
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Delete item
    await dynamo.send(
      new DeleteCommand({
        TableName: PRODUCTS_TABLE,
        Key: { id: product.id },
      })
    );

    // Log deletion
    try {
      await dynamo.send(
        new PutCommand({
          TableName: PRODUCT_LOGS_TABLE,
          Item: {
            id: uuidv4(),
            action: "DELETE_PRODUCT",
            performedBy: req.body.adminEmail || "Unknown Admin",
            targetProduct: product.name,
            details: `Deleted product "${product.name}".`,
            timestamp: new Date().toISOString(),
          },
        })
      );
    } catch (logError) {
      console.error("Logging failed:", logError.message);
    }

    res.json({ message: "Product deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete product", error: err.message });
  }
};
