# 🍃 MongoDB MCP Server

A powerful Model Context Protocol (MCP) server that enables Claude AI to interact seamlessly with MongoDB databases. Perform database operations, queries, and data management through natural language conversations.

## ✨ Features

- 🔍 **Database Discovery**: List databases and collections
- 📊 **Data Operations**: Find, insert, update, and delete documents
- 📈 **Analytics**: Count documents and perform aggregations
- 🔧 **Management**: Drop collections and manage database structure
- 🛡️ **Type Safety**: Automatic ObjectId handling and validation
- 📝 **Rich Responses**: Formatted JSON output with error handling

## 🚀 Quick Start

### Prerequisites

- Node.js (version 16 or higher)
- MongoDB (local installation or MongoDB Atlas)
- Claude AI with MCP support

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/claude-mongodb-mcp.git
   cd claude-mongodb-mcp
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   # Copy the example environment file
   cp .env.example .env
   
   # Edit .env with your MongoDB connection details
   nano .env
   ```

4. **Configure your `.env` file**
   ```env
   # MongoDB connection string
   MONGODB_URI=mongodb://localhost:27017
   # Or for MongoDB Atlas:
   # MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/

   # Default database (optional)
   DEFAULT_DATABASE=myapp
   ```

### MongoDB Setup Options

#### Option 1: Local MongoDB
```bash
# Install MongoDB locally (Ubuntu/Debian)
sudo apt update
sudo apt install -y mongodb

# Start MongoDB service
sudo systemctl start mongodb
sudo systemctl enable mongodb
```

#### Option 2: MongoDB Atlas (Cloud)
1. Create a free account at [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create a new cluster
3. Get your connection string from "Connect" → "Connect your application"
4. Add your connection string to `.env`

#### Option 3: Docker
```bash
# Run MongoDB in Docker
docker run -d \
  --name mongodb \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=password \
  mongo:latest
```

## 🔧 Configuration

### Claude MCP Configuration

Add this server to your Claude MCP configuration file:

**For macOS/Linux:** `~/.config/claude/mcp_servers.json`
**For Windows:** `%APPDATA%\Claude\mcp_servers.json`

```json
{
  "mcpServers": {
    "mongodb": {
      "command": "node",
      "args": ["/path/to/your/claude-mongodb-mcp/src/index.js"],
      "env": {
        "MONGODB_URI": "mongodb://localhost:27017",
        "DEFAULT_DATABASE": "myapp"
      }
    }
  }
}
```

### Testing the Setup

1. **Start the MCP server directly** (for testing)
   ```bash
   npm start
   ```

2. **Run the test data setup**
   ```bash
   npm run setup-test-data
   ```

3. **Development mode** (auto-restart on changes)
   ```bash
   npm run dev
   ```

## 📖 Usage Examples

Once configured, you can ask Claude to perform database operations using natural language:

### Basic Queries
- *"Show me all databases"*
- *"List collections in the 'myapp' database"*
- *"Find all users in the Engineering department"*
- *"Count how many products cost more than $100"*

### Data Operations
- *"Insert a new user with name 'John Doe', age 30, and email 'john@example.com'"*
- *"Update all users in the Sales department to have a 10% salary increase"*
- *"Delete products that are out of stock"*

### Advanced Operations
- *"Find users who joined after 2022 and earn more than $70,000"*
- *"Show me the average salary by department"*
- *"Drop the 'temp_data' collection"*

## 🛠️ Available Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `list_databases` | Lists all MongoDB databases | None |
| `list_collections` | Lists collections in a database | `database` |
| `find_documents` | Finds documents with optional filtering | `database`, `collection`, `query`, `limit`, `skip` |
| `count_documents` | Counts documents matching filter | `database`, `collection`, `filter` |
| `insert_document` | Inserts a new document | `database`, `collection`, `document` |
| `update_documents` | Updates existing documents | `database`, `collection`, `filter`, `update`, `updateMany` |
| `delete_documents` | Deletes documents | `database`, `collection`, `filter`, `deleteMany` |
| `drop_collection` | Drops an entire collection | `database`, `collection` |

## 🧪 Development

### Project Structure
```
claude-mongodb-mcp/
├── src/
│   └── index.js          # Main MCP server implementation
├── test/
│   └── test-server.js    # Test data setup script
├── .env.example          # Environment template
├── .gitignore           # Git ignore rules
├── package.json         # Project dependencies
└── README.md           # This file
```

### Adding New Features

1. **Add new tools** in the `ListToolsRequestSchema` handler
2. **Implement tool logic** in the `CallToolRequestSchema` handler
3. **Update this README** with new functionality
4. **Test thoroughly** with various MongoDB operations

### Error Handling

The server includes comprehensive error handling for:
- MongoDB connection issues
- Invalid ObjectId formats
- Missing required parameters
- Database operation failures
- Network connectivity problems

## 🔒 Security Considerations

- **Never commit** your `.env` file with real credentials
- **Use MongoDB Atlas** for production with proper authentication
- **Limit database permissions** to only what's needed
- **Validate input** before performing operations
- **Monitor database access** logs regularly

## 📚 MongoDB Query Examples

### Complex Queries
```javascript
// Find users with salary in range
{
  "salary": { "$gte": 50000, "$lte": 100000 }
}

// Find users by department and age
{
  "department": "Engineering",
  "age": { "$gt": 25 }
}

// Text search (requires text index)
{
  "$text": { "$search": "javascript developer" }
}
```

### Update Operations
```javascript
// Set new values
{
  "$set": { "department": "DevOps", "salary": 85000 }
}

// Increment values
{
  "$inc": { "salary": 5000, "experience": 1 }
}

// Add to array
{
  "$push": { "skills": "MongoDB" }
}
```

## 🐛 Troubleshooting

### Common Issues

**Connection refused to MongoDB**
- Check if MongoDB is running: `sudo systemctl status mongodb`
- Verify connection string in `.env`
- Check firewall settings

**MCP server not recognized by Claude**
- Verify MCP configuration file path
- Check Node.js path in configuration
- Restart Claude after configuration changes

**ObjectId validation errors**
- Ensure `_id` values are valid MongoDB ObjectIds
- Use string format: `"507f1f77bcf86cd799439011"`

**Permission denied errors**
- Check MongoDB user permissions
- Verify database access rights
- Update connection string with proper credentials

### Debug Mode
```bash
# Enable debug logging
DEBUG=mongodb-mcp npm start
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b new-feature`
3. Make your changes and test thoroughly
4. Commit your changes: `git commit -am 'Add new feature'`
5. Push to the branch: `git push origin new-feature`
6. Submit a pull request

## 🙏 Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) by Anthropic
- [MongoDB Node.js Driver](https://mongodb.github.io/node-mongodb-native/)
- Claude AI for natural language database interactions

**Made with ❤️ for the Claude AI community**