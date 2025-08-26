#!/usr/bin/env node

import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { MongoClient, ObjectId } = require("mongodb");

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const DEFAULT_DATABASE = process.env.DEFAULT_DATABASE || "testdb";

// MongoDB client
let mongoClient = null;
let isConnected = false;

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

// Create the server
const server = new Server(
  {
    name: "mongodb-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_databases",
        description: "List all databases in MongoDB",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "list_collections",
        description: "List all collections in a database",
        inputSchema: {
          type: "object",
          properties: {
            database: {
              type: "string",
              description: "Database name",
            },
          },
          required: ["database"],
        },
      },
      {
        name: "find_documents",
        description: "Find documents in a collection",
        inputSchema: {
          type: "object",
          properties: {
            database: {
              type: "string",
              description: "Database name",
            },
            collection: {
              type: "string",
              description: "Collection name",
            },
            query: {
              type: "object",
              description: "MongoDB query filter",
            },
            limit: {
              type: "number",
              description: "Maximum number of documents to return",
              default: 10,
            },
            skip: {
              type: "number",
              description: "Number of documents to skip",
              default: 0,
            },
          },
          required: ["database", "collection"],
        },
      },
      {
        name: "count_documents",
        description: "Count documents in a collection",
        inputSchema: {
          type: "object",
          properties: {
            database: {
              type: "string",
              description: "Database name",
            },
            collection: {
              type: "string",
              description: "Collection name",
            },
            filter: {
              type: "object",
              description: "MongoDB query filter",
            },
          },
          required: ["database", "collection"],
        },
      },
      {
        name: "insert_document",
        description: "Insert a document into a collection",
        inputSchema: {
          type: "object",
          properties: {
            database: {
              type: "string",
              description: "Database name",
            },
            collection: {
              type: "string",
              description: "Collection name",
            },
            document: {
              type: "object",
              description: "Document to insert",
            },
          },
          required: ["database", "collection", "document"],
        },
      },
      {
        name: "update_documents",
        description: "Update documents in a collection",
        inputSchema: {
          type: "object",
          properties: {
            database: {
              type: "string",
              description: "Database name",
            },
            collection: {
              type: "string",
              description: "Collection name",
            },
            filter: {
              type: "object",
              description: "MongoDB query filter",
            },
            update: {
              type: "object",
              description: "MongoDB update operation",
            },
            updateMany: {
              type: "boolean",
              description: "Update multiple documents",
              default: false,
            },
          },
          required: ["database", "collection", "filter", "update"],
        },
      },
      {
        name: "delete_documents",
        description: "Delete documents from a collection",
        inputSchema: {
          type: "object",
          properties: {
            database: {
              type: "string",
              description: "Database name",
            },
            collection: {
              type: "string",
              description: "Collection name",
            },
            filter: {
              type: "object",
              description: "MongoDB query filter to match documents to delete",
            },
            deleteMany: {
              type: "boolean",
              description: "Delete multiple documents (true) or just one (false)",
              default: false,
            },
          },
          required: ["database", "collection", "filter"],
        },
      },
      {
        name: "drop_collection",
        description: "Drop (delete) an entire collection",
        inputSchema: {
          type: "object",
          properties: {
            database: {
              type: "string",
              description: "Database name",
            },
            collection: {
              type: "string",
              description: "Collection name to drop",
            },
          },
          required: ["database", "collection"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    ensureConnection();

    switch (name) {
      case "list_databases": {
        const adminDb = mongoClient.db().admin();
        const databases = await adminDb.listDatabases();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(databases.databases, null, 2),
            },
          ],
        };
      }

      case "list_collections": {
        if (!args.database || typeof args.database !== 'string') {
          throw new Error("Database name is required and must be a string");
        }
        const db = mongoClient.db(args.database);
        const collections = await db.listCollections().toArray();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(collections, null, 2),
            },
          ],
        };
      }

      case "find_documents": {
        if (!args.database || typeof args.database !== 'string') {
          throw new Error("Database name is required and must be a string");
        }
        if (!args.collection || typeof args.collection !== 'string') {
          throw new Error("Collection name is required and must be a string");
        }
        
        const processedQuery = processMongoDocument(args.query || {});
        const db = mongoClient.db(args.database);
        const coll = db.collection(args.collection);
        const documents = await coll
          .find(processedQuery)
          .skip(args.skip || 0)
          .limit(args.limit || 10)
          .toArray();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(documents, null, 2),
            },
          ],
        };
      }

      case "count_documents": {
        if (!args.database || typeof args.database !== 'string') {
          throw new Error("Database name is required and must be a string");
        }
        if (!args.collection || typeof args.collection !== 'string') {
          throw new Error("Collection name is required and must be a string");
        }
        
        const processedFilter = processMongoDocument(args.filter || {});
        const db = mongoClient.db(args.database);
        const coll = db.collection(args.collection);
        const count = await coll.countDocuments(processedFilter);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ count }, null, 2),
            },
          ],
        };
      }

      case "insert_document": {
        console.error("Insert document called with args:", JSON.stringify(args, null, 2));
        
        if (!args.database || typeof args.database !== 'string') {
          throw new Error("Database name is required and must be a string");
        }
        if (!args.collection || typeof args.collection !== 'string') {
          throw new Error("Collection name is required and must be a string");
        }
        if (!args.document || typeof args.document !== 'object' || Array.isArray(args.document)) {
          throw new Error("Document must be a valid object");
        }
        
        const processedDoc = processMongoDocument(args.document);
        console.error("Processed document:", JSON.stringify(processedDoc, null, 2));
        
        const db = mongoClient.db(args.database);
        const coll = db.collection(args.collection);
        const result = await coll.insertOne(processedDoc);
        
        console.error("Insert result:", JSON.stringify({
          acknowledged: result.acknowledged,
          insertedId: result.insertedId.toString(),
        }, null, 2));
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                acknowledged: result.acknowledged,
                insertedId: result.insertedId.toString(),
                message: `Successfully inserted document into ${args.database}.${args.collection}`
              }, null, 2),
            },
          ],
        };
      }

      case "update_documents": {
        if (!args.database || typeof args.database !== 'string') {
          throw new Error("Database name is required and must be a string");
        }
        if (!args.collection || typeof args.collection !== 'string') {
          throw new Error("Collection name is required and must be a string");
        }
        if (!args.filter || typeof args.filter !== 'object') {
          throw new Error("Filter must be a valid object");
        }
        if (!args.update || typeof args.update !== 'object') {
          throw new Error("Update must be a valid object");
        }
        
        const processedFilter = processMongoDocument(args.filter);
        const processedUpdate = processMongoDocument(args.update);
        const db = mongoClient.db(args.database);
        const coll = db.collection(args.collection);
        const result = args.updateMany 
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
                upsertedId: result.upsertedId?.toString(),
              }, null, 2),
            },
          ],
        };
      }

      case "delete_documents": {
        console.error("Delete documents called with args:", JSON.stringify(args, null, 2));
        
        if (!args.database || typeof args.database !== 'string') {
          throw new Error("Database name is required and must be a string");
        }
        if (!args.collection || typeof args.collection !== 'string') {
          throw new Error("Collection name is required and must be a string");
        }
        if (!args.filter || typeof args.filter !== 'object') {
          throw new Error("Filter must be a valid object");
        }
        
        const processedFilter = processMongoDocument(args.filter);
        console.error("Processed filter:", JSON.stringify(processedFilter, null, 2));
        
        const db = mongoClient.db(args.database);
        const coll = db.collection(args.collection);
        
        const result = args.deleteMany 
          ? await coll.deleteMany(processedFilter)
          : await coll.deleteOne(processedFilter);
        
        console.error("Delete result:", JSON.stringify({
          acknowledged: result.acknowledged,
          deletedCount: result.deletedCount,
        }, null, 2));
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                acknowledged: result.acknowledged,
                deletedCount: result.deletedCount,
                message: `Successfully deleted ${result.deletedCount} document(s) from ${args.database}.${args.collection}`
              }, null, 2),
            },
          ],
        };
      }

      case "drop_collection": {
        console.error("Drop collection called with args:", JSON.stringify(args, null, 2));
        
        if (!args.database || typeof args.database !== 'string') {
          throw new Error("Database name is required and must be a string");
        }
        if (!args.collection || typeof args.collection !== 'string') {
          throw new Error("Collection name is required and must be a string");
        }
        
        const db = mongoClient.db(args.database);
        const result = await db.collection(args.collection).drop();
        
        console.error("Drop collection result:", result);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: result,
                message: `Successfully dropped collection ${args.collection} from database ${args.database}`
              }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    console.error("Error in tool handler:", error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
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