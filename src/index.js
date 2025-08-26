#!/usr/bin/env node

import 'dotenv/config';

//// Replace static SDK imports with a tolerant dynamic loader that logs available exports
async function loadMcpAndStdio() {
  // try server entrypoints (exports maps to dist/* so these should resolve)
  const candidates = [
    '@modelcontextprotocol/sdk/server/index.js',
    '@modelcontextprotocol/sdk/dist/server/index.js'
  ];
  let serverModule = null;
  for (const c of candidates) {
    try {
      serverModule = await import(c);
      break;
    } catch (e) {
      // ignore and try next
    }
  }
  if (!serverModule) {
    throw new Error("Could not import the SDK server module. Check node_modules/@modelcontextprotocol/sdk/dist/server/");
  }
  console.error('SDK server exports:', Object.keys(serverModule));

  // pick McpServer — try several likely export names (Server is used by this SDK)
  const McpServer =
    serverModule.McpServer ??
    serverModule.Mcp ??
    serverModule.Server ??
    serverModule.default?.McpServer ??
    serverModule.default?.Server ??
    serverModule.default;

  if (!McpServer) {
    console.error('Full server module:', serverModule);
    throw new Error("SDK server module does not expose McpServer/Server. See logs of available exports above.");
  }

  // load stdio transport (same candidate logic)
  const stdioCandidates = [
    '@modelcontextprotocol/sdk/server/stdio.js',
    '@modelcontextprotocol/sdk/dist/server/stdio.js'
  ];
  let stdioModule = null;
  for (const c of stdioCandidates) {
    try {
      stdioModule = await import(c);
      break;
    } catch (e) {}
  }
  if (!stdioModule) {
    throw new Error("Could not import the SDK stdio transport module.");
  }
  console.error('SDK stdio exports:', Object.keys(stdioModule));

  // pick a stdio transport from common names
  const StdioServerTransport =
    stdioModule.StdioServerTransport ??
    stdioModule.Stdio ??
    stdioModule.StdioTransport ??
    stdioModule.default?.StdioServerTransport ??
    stdioModule.default ??
    null;

  if (!StdioServerTransport) {
    console.error('Full stdio module:', stdioModule);
    throw new Error("SDK stdio module does not expose a Stdio transport. See logs above.");
  }

  return { McpServer, StdioServerTransport };
}

const { McpServer, StdioServerTransport } = await loadMcpAndStdio();

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { MongoClient, ObjectId } = require("mongodb");
import { z } from "zod";

// Configuration
const MONGODB_URI = process.env.MONGODB_URI;
const DEFAULT_DATABASE = process.env.DEFAULT_DATABASE;

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

// Create and configure the MCP server (robust instantiation)
async function instantiateServer(ServerExport, options) {
  console.error('Instantiating server, ServerExport type:', typeof ServerExport, 'name:', ServerExport?.name);

  if (!ServerExport) {
    throw new Error('No server export provided');
  }

  // helper to try constructing with a list of arguments
  const tryConstruct = (args) => {
    try {
      const inst = Reflect.construct(ServerExport, args);
      if (inst) {
        console.error('Construct succeeded with args:', JSON.stringify(args.map(a => (typeof a === 'object' ? Object.keys(a || {}) : String(a)))),);
        return inst;
      }
    } catch (e) {
      console.error('Construct failed for args:', JSON.stringify(args.map(a => (typeof a === 'object' ? Object.keys(a || {}) : String(a)))), '->', e?.message);
    }
    return null;
  };

  // 1) If it's a function/class, try a number of constructor signatures
  if (typeof ServerExport === 'function') {
    // common argument variations to try
    const argVariants = [
      [options],
      [{ ...options }],                  // shallow copy
      [{ options }],                     // wrapped under "options"
      [{ server: options }],             // wrapped under "server"
      [{ capabilities: options?.capabilities ?? [] }], // only capabilities
      [options, {}],                     // options + empty second arg
      [],                                 // no-arg constructor
    ];

    for (const args of argVariants) {
      const inst = tryConstruct(args);
      if (inst) return inst;
    }

    // 2) try nested Server property (export may be a namespace)
    try {
      if (ServerExport.Server && typeof ServerExport.Server === 'function') {
        try {
          const inst = Reflect.construct(ServerExport.Server, [options]);
          console.error('Constructed ServerExport.Server with options');
          return inst;
        } catch (e) {
          console.error('new ServerExport.Server(options) failed:', e?.message);
        }
      }
    } catch (e) {
      console.error('Error accessing nested ServerExport.Server:', e?.message);
    }

    // 3) try common static factory methods
    const factories = ['create', 'fromOptions', 'from', 'build'];
    for (const name of factories) {
      try {
        if (typeof ServerExport[name] === 'function') {
          console.error('Trying factory method:', name);
          const created = await ServerExport[name](options);
          if (created) return created;
        }
      } catch (e) {
        console.error(`ServerExport.${name}(options) failed:`, e?.message);
      }
    }

    // 4) try calling as function (non-class export)
    try {
      const maybe = ServerExport(options);
      if (maybe) {
        console.error('ServerExport(options) returned an instance (callable export).');
        return maybe;
      }
    } catch (e) {
      console.error('ServerExport(options) failed:', e?.message);
    }
  } else {
    console.error('ServerExport is not a function; value:', ServerExport);
  }

  // Last-ditch: log the full export shape to help debugging
  try {
    console.error('Unable to instantiate MCP Server. Server export keys:', Object.keys(ServerExport));
    console.error('Full server export:', ServerExport);
  } catch (e) {
    console.error('Error while dumping server export:', e?.message);
  }

  throw new Error('Unable to instantiate MCP Server from SDK export. Inspect SDK exports and logs above.');
}

const serverOptions = {
  name: "mongodb-mcp-server",
  version: "1.0.0",
  // Server implementation expects options.capabilities; provide empty array to start.
  capabilities: []
};

const server = await instantiateServer(McpServer, serverOptions);

// Register tools by adding request handlers directly
server._requestHandlers.set(
  "list_databases",
  async () => {
    ensureConnection();
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
);

server._requestHandlers.set(
  "list_collections",
  async ({ database }) => {
    ensureConnection();
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
);

server._requestHandlers.set(
  "find_documents",
  async ({ database, collection, query = {}, limit = 10, skip = 0 }) => {
    ensureConnection();
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
);

server._requestHandlers.set(
  "insert_document",
  async ({ database, collection, document }) => {
    ensureConnection();
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
);

server._requestHandlers.set(
  "update_documents",
  async ({ database, collection, filter, update, updateMany = false }) => {
    ensureConnection();
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
);

server._requestHandlers.set(
  "count_documents",
  async ({ database, collection, filter = {} }) => {
    ensureConnection();
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
);

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