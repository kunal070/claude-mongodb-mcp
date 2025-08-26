#!/usr/bin/env node

import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const TEST_DATABASE = "testdb";
const TEST_COLLECTION = "users";

async function setupTestData() {
  console.log("Setting up test data...");
  
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log("Connected to MongoDB");
    
    const db = client.db(TEST_DATABASE);
    const collection = db.collection(TEST_COLLECTION);
    
    // Clear existing test data
    await collection.deleteMany({});
    
    // Insert sample data
    const sampleUsers = [
      {
        name: "Alice Johnson",
        age: 28,
        email: "alice@example.com",
        department: "Engineering",
        salary: 75000,
        joinDate: new Date("2022-03-15")
      },
      {
        name: "Bob Smith",
        age: 35,
        email: "bob@example.com", 
        department: "Marketing",
        salary: 65000,
        joinDate: new Date("2021-07-22")
      },
      {
        name: "Carol Davis",
        age: 42,
        email: "carol@example.com",
        department: "Engineering", 
        salary: 85000,
        joinDate: new Date("2020-01-10")
      },
      {
        name: "David Wilson",
        age: 29,
        email: "david@example.com",
        department: "Sales",
        salary: 60000,
        joinDate: new Date("2023-05-03")
      },
      {
        name: "Eva Brown",
        age: 31,
        email: "eva@example.com",
        department: "Engineering",
        salary: 80000,
        joinDate: new Date("2022-09-18")
      }
    ];
    
    const result = await collection.insertMany(sampleUsers);
    console.log(`Inserted ${result.insertedCount} test users`);
    
    // Create some test products too
    const productsCollection = db.collection("products");
    await productsCollection.deleteMany({});
    
    const sampleProducts = [
      {
        name: "Laptop Pro",
        category: "Electronics",
        price: 1299.99,
        inStock: 25,
        tags: ["computer", "laptop", "professional"]
      },
      {
        name: "Wireless Mouse",
        category: "Electronics", 
        price: 29.99,
        inStock: 150,
        tags: ["mouse", "wireless", "accessory"]
      },
      {
        name: "Office Chair",
        category: "Furniture",
        price: 299.99,
        inStock: 12,
        tags: ["chair", "office", "ergonomic"]
      }
    ];
    
    const productsResult = await productsCollection.insertMany(sampleProducts);
    console.log(`Inserted ${productsResult.insertedCount} test products`);
    
    console.log("Test data setup complete!");
    console.log("\nSample queries you can try with Claude:");
    console.log("- 'Show me all users in the Engineering department'");
    console.log("- 'Find users older than 30'");
    console.log("- 'Count how many products are in stock'");
    console.log("- 'Show me the average salary by department'");
    console.log("- 'List all collections in the testdb database'");
    
  } catch (error) {
    console.error("Error setting up test data:", error);
  } finally {
    await client.close();
  }
}

setupTestData();