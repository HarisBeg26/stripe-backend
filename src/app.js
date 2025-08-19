/**
 * Stripe Backend Service - Main Application Entry Point
 * 
 * This Node.js application provides a backend service for handling Stripe payments,
 * company management, and webhook processing. It includes:
 * - Company registration and management
 * - Stripe payment intent creation and processing
 * - Webhook handling for payment events
 * - Payment transaction history tracking
 */

// Load environment variables from .env file
require('dotenv').config();

// Import required dependencies
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const {Sequelize, DataTypes} = require('sequelize');
const fs = require('fs');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Swagger documentation setup
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load('./swagger.yaml');

// Import route handlers
const companyRoutes = require('./routes/companyRoutes');
const stripeRoutes = require('./routes/stripeRoute');
const stripeWebhookRoutes = require('./routes/stripeWebhookRoutes');
const userRoutes = require('./routes/userRoutes'); // Import user routes

// Initialize Express application
const app = express();
const port = process.env.PORT || 3000;


/**
 * Database Configuration & Setup
 * Configure PostgreSQL connection with SSL for production environments
 */
// Path to the DigitalOcean CA certificate
const caCertPath = path.join(__dirname, '../ca-certificate.crt');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false, // Set to true to see SQL queries in console
    dialectOptions: {
        ssl: {
            require: true,
            // Use the CA certificate to verify the server's identity
            ca: fs.readFileSync(caCertPath).toString(),
        }
    }
});

/**
 * Database Models Setup
 * Initialize Sequelize models and define relationships between entities
 */
const Company = require('./models/company')(sequelize, DataTypes);
const User = require('./models/user')(sequelize, DataTypes);
const PaymentTransaction = require('./models/PaymentTransaction')(sequelize, DataTypes);

// Define model relationships
// One company can have many payment transactions
// Define model relationships
User.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Company.hasMany(User, { foreignKey: 'companyId', as: 'users' });
PaymentTransaction.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Company.hasMany(PaymentTransaction, { foreignKey: 'companyId', as: 'paymentTransactions' });

/**
 * Development/Testing Route
 * Test endpoint to verify PaymentTransaction table connectivity
 * This route should be removed or secured in production
 */
app.get('/api/stripe/test-payment-table', async (req, res) => {
    const { PaymentTransaction } = req.db;
    
    try {
        // Simple test - count rows in PaymentTransaction table
        const count = await PaymentTransaction.count();
        console.log('PaymentTransaction table row count:', count);
        
        res.status(200).json({
            message: 'PaymentTransaction table test successful',
            rowCount: count,
            tableName: PaymentTransaction.tableName,
            modelName: PaymentTransaction.name
        });
    } catch (error) {
        console.error('PaymentTransaction table test error:', error);
        res.status(500).json({
            message: 'PaymentTransaction table test failed',
            error: error.message
        });
    }
});

/**
 * Database Connection & Synchronization
 * Authenticate with the database and sync models (create tables if they don't exist)
 */
sequelize.authenticate().then(() => {
    console.log('Sequelize authenticated successfully.');
    // return sequelize.sync({ force: true }); // WARNING: This drops and recreates tables. Use only in development.
}).then(() => {
    console.log('Database synchronized successfully.');
}).catch((err) => {
    console.error('Unable to connect to the database:', err);
    process.exit(1); // Exit application if database connection fails
});

/**
 * Security Middleware
 * Apply security headers and rate limiting
 */
app.use(helmet({
    contentSecurityPolicy: false, // Disable for Swagger UI
}));

// Rate limiting for authentication endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    message: { message: 'Too many authentication attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// General API rate limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { message: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply rate limiting to auth routes
app.use('/api/users/login', authLimiter);
app.use('/api/users/register', authLimiter);

// Apply general rate limiting to all API routes
app.use('/api/', apiLimiter);

/**
 * CORS Configuration
 * Enable Cross-Origin Resource Sharing for frontend applications
 * In production, consider restricting origins to specific domains
 */
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

/**
 * Database Models Middleware
 * Inject database models into request object for use in controllers
 * This makes models available as req.db.ModelName in route handlers
 */
app.use((req, res, next) => {
    req.db = {
        Company,
        User,
        PaymentTransaction,
        sequelize
    };
    next();
});

/**
 * API Documentation Setup
 * Swagger UI for interactive API documentation
 * Accessible at http://localhost:3000/api-docs
 */
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
console.log(`Access documentation at http://localhost:${port}/api-docs`);

/**
 * Stripe Webhook Route Registration
 * IMPORTANT: This must be registered BEFORE the express.json() middleware
 * because Stripe webhooks require raw body data for signature verification
 */
app.use('/api/stripe/webhook', stripeWebhookRoutes);

// JSON parsing middleware for regular API routes
app.use(express.json());

/**
 * Route Handlers Registration
 * Register all API route handlers with their respective base paths
 */
app.use('/api/users', userRoutes); // User registration and login
app.use('/api/companies', companyRoutes);        // Company management endpoints
app.use('/api/stripe', stripeRoutes);            // Stripe payment endpoints

/**
 * Health Check Endpoint
 * Simple endpoint to verify service is running
 */
app.get('/', (req, res) => {
    res.send('Company Service is running!');
});

/**
 * Global Error Handler
 * Catch and handle any unhandled errors in the application
 */
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

/**
 * Start HTTP Server
 * Begin listening for incoming requests on the specified port
 */
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});