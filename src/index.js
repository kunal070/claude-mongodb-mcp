#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MongoClient, ObjectId } from "mongodb";
import { z } from "zod";

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const DEFAULT_DATABASE = process.env.DEFAULT_DATABASE || "testdb";

// MongoDB client
let mongoClient = null;
let isConnected = false;

// Validation schemas
const DatabaseSchema = z.string().min(1);
const CollectionSchema = z.string().min(1);
const QuerySchema = z.record(z.any()).optional();
const DocumentSchema = z.record(z.any());

// Initialize MongoDB connection
async function initMongoDB() {
  try {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    isConnected = true;
    console.error("Connected to MongoDB successfully");
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    process.exit(1);
  }
}

// Helper function to ensure connection
function ensureConnection() {
  if (!isConnected || !mongoClient) {
    throw new Error("MongoDB connection not established");
  }
}

// Helper to safely parse ObjectId
function parseObjectId(value) {
  if (typeof value === "string" && ObjectId.isValid(value)) {
    return new ObjectId(value);
  }
  return value;
}

// Recursively process query/document to handle ObjectIds
function processMongoDocument(obj) {
  if (obj === null || obj === undefined) return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(processMongoDocument);
  }
  
  if (typeof obj === "object") {
    const processed = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === "_id" || key.endsWith("Id")) {
        processed[key] = parseObjectId(value);
      } else if (typeof value === "object") {
        processed[key] = processMongoDocument(value);
      } else {
        processed[key] = value;
      }
    }
    return processed;
  }
  
  return obj;
}

// Create and configure the MCP server
const server = new Server(
  {
    name: "mongodb-mcp-server",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// Helper function to register handlers (works with different SDK versions)
function registerHandler(method, handler) {
  try {
    // Try new format first
    server.setRequestHandler({ method }, handler);
  } catch (error) {
    try {
      // Fall back to old format
      server.setRequestHandler(method, handler);
    } catch (fallbackError) {
      console.error(`Failed to register handler for ${method}:`, error, fallbackError);
      throw error;
    }
  }
}

// Define tools schema
const tools = [
  {
    name: "list_databases",
    description: "List all available databases",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "list_collections",
    description: "List all collections in a database",
    inputSchema: {
      type: "object",
      properties: {
        database: {
          type: "string",
          description: "Database name"
        }
      },
      required: ["database"]
    }
  },
  {
    name: "find_documents",
    description: "Find documents in a collection with optional query filter",
    inputSchema: {
      type: "object",
      properties: {
        database: {
          type: "string",
          description: "Database name"
        },
        collection: {
          type: "string", 
          description: "Collection name"
        },
        query: {
          type: "object",
          description: "MongoDB query filter (optional)",
          default: {}
        },
        limit: {
          type: "number",
          description: "Maximum number of documents to return (default: 10)",
          default: 10
        },
        skip: {
          type: "number",
          description: "Number of documents to skip (default: 0)",
          default: 0
        }
      },
      required: ["database", "collection"]
    }
  },
  {
    name: "insert_document",
    description: "Insert a single document into a collection",
    inputSchema: {
      type: "object",
      properties: {
        database: {
          type: "string",
          description: "Database name"
        },
        collection: {
          type: "string",
          description: "Collection name"
        },
        document: {
          type: "object",
          description: "Document to insert"
        }
      },
      required: ["database", "collection", "document"]
    }
  },
  {
    name: "update_documents",
    description: "Update documents in a collection",
    inputSchema: {
      type: "object",
      properties: {
        database: {
          type: "string",
          description: "Database name"
        },
        collection: {
          type: "string",
          description: "Collection name"
        },
        filter: {
          type: "object",
          description: "MongoDB filter to match documents"
        },
        update: {
          type: "object",
          description: "MongoDB update operations"
        },
        updateMany: {
          type: "boolean",
          description: "Update multiple documents (default: false)",
          default: false
        }
      },
      required: ["database", "collection", "filter", "update"]
    }
  },
  {
    name: "count_documents",
    description: "Count documents in a collection with optional filter",
    inputSchema: {
      type: "object",
      properties: {
        database: {
          type: "string",
          description: "Database name"
        },
        collection: {
          type: "string",
          description: "Collection name"
        },
        filter: {
          type: "object",
          description: "MongoDB filter (optional)",
          default: {}
        }
      },
      required: ["database", "collection"]
    }
  }
];

// Register tools/list handler
registerHandler("tools/list", async () => {
  return { tools };
});

// Register tools/call handler
registerHandler("tools/call", async (request) => {
  const { name, arguments: args } = request.params;
  
  ensureConnection();

  try {
    switch (name) {
      case "list_databases": {
        const adminDb = mongoClient.db().admin();
        const databases = await adminDb.listDatabases();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(databases.databases, null, 2)
            }
          ]
        };
      }

      case "list_collections": {
        const { database } = args;
        DatabaseSchema.parse(database);
        
        const db = mongoClient.db(database);
        const collections = await db.listCollections().toArray();
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(collections, null, 2)
            }
          ]
        };
      }

      case "find_documents": {
        const { database, collection, query = {}, limit = 10, skip = 0 } = args;
        
        DatabaseSchema.parse(database);
        CollectionSchema.parse(collection);
        
        const processedQuery = processMongoDocument(query);
        const db = mongoClient.db(database);
        const coll = db.collection(collection);
        
        const documents = await coll
          .find(processedQuery)
          .skip(skip)
          .limit(limit)
          .toArray();
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(documents, null, 2)
            }
          ]
        };
      }

      case "insert_document": {
        const { database, collection, document } = args;
        
        DatabaseSchema.parse(database);
        CollectionSchema.parse(collection);
        DocumentSchema.parse(document);
        
        const processedDoc = processMongoDocument(document);
        const db = mongoClient.db(database);
        const coll = db.collection(collection);
        
        const result = await coll.insertOne(processedDoc);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                acknowledged: result.acknowledged,
                insertedId: result.insertedId.toString()
              }, null, 2)
            }
          ]
        };
      }

      case "update_documents": {
        const { database, collection, filter, update, updateMany = false } = args;
        
        DatabaseSchema.parse(database);
        CollectionSchema.parse(collection);
        
        const processedFilter = processMongoDocument(filter);
        const processedUpdate = processMongoDocument(update);
        const db = mongoClient.db(database);
        const coll = db.collection(collection);
        
        const result = updateMany 
          ? await coll.updateMany(processedFilter, processedUpdate)
          : await coll.updateOne(processedFilter, processedUpdate);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                acknowledged: result.acknowledged,
                matchedCount: result.matchedCount,
                modifiedCount: result.modifiedCount,
                upsertedId: result.upsertedId?.toString()
              }, null, 2)
            }
          ]
        };
      }

      case "count_documents": {
        const { database, collection, filter = {} } = args;
        
        DatabaseSchema.parse(database);
        CollectionSchema.parse(collection);
        
        const processedFilter = processMongoDocument(filter);
        const db = mongoClient.db(database);
        const coll = db.collection(collection);
        
        const count = await coll.countDocuments(processedFilter);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ count }, null, 2)
            }
          ]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
});

// Start the server
async function main() {
  console.error("Starting MongoDB MCP Server...");
  
  await initMongoDB();
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error("MongoDB MCP Server is running!");
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.error("\nShutting down gracefully...");
  if (mongoClient) {
    await mongoClient.close();
  }
  process.exit(0);
});

main().catch(console.error);