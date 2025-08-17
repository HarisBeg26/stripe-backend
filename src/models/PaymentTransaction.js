/**
 * Payment Transaction Model
 * 
 * Tracks all payment transactions processed through the platform.
 * Maintains both Stripe's payment status and internal business workflow status.
 * 
 * This model serves as the single source of truth for payment history,
 * reconciliation, and business process management.
 * 
 * @param {Sequelize} sequelize - The Sequelize instance
 * @param {DataTypes} DataTypes - Sequelize data types
 * @returns {Model} PaymentTransaction model
 */
module.exports = (sequelize, DataTypes) => {
    const PaymentTransaction = sequelize.define('PaymentTransaction', {
        // Primary key: UUID for security and scalability
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            comment: 'Unique identifier for the payment transaction'
        },
        
        // Foreign key to Company model
        companyId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'companies',
                key: 'id',
            },
            comment: 'ID of the company receiving the payment'
        },
        
        // Customer identifier (can be email, user ID, or any customer reference)
        customer: {
            type: DataTypes.STRING,
            allowNull: false,
            comment: 'Customer identifier (email, user ID, etc.)'
        },
        
        // Payment amount in smallest currency unit (e.g., cents for USD)
        amount: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: 'Payment amount in smallest currency unit (cents, pence, etc.)'
        },
        
        // ISO currency code
        currency: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'eur',
            comment: 'ISO currency code (USD, EUR, GBP, etc.)'
        },
        
        // Stripe Payment Intent ID for tracking with Stripe
        stripePaymentIntentId: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            comment: 'Stripe Payment Intent ID for reconciliation with Stripe records'
        },
        
        // Stripe Subscription ID for tracking subscriptions
        stripeSubscriptionId: {
            type: DataTypes.STRING,
            allowNull: true, // Not all transactions are subscriptions
            unique: true, // A subscription ID should be unique if present
            comment: 'Stripe Subscription ID for managing subscription-based payments'
        },
        
        // Stripe payment status - reflects actual payment state from Stripe
        status: {
            type: DataTypes.ENUM('pending', 'succeeded', 'failed', 'canceled', 'refunded'),
            defaultValue: 'pending',
            allowNull: false,
            comment: 'Stripe payment status - updated by webhooks'
        },
        
        // Internal business workflow status - separate from payment status
        internalStatus: {
            type: DataTypes.ENUM('awaiting_approval', 'approved', 'rejected', 'fulfilled', 'canceled_by_business'),
            defaultValue: 'awaiting_approval',
            allowNull: false,
            comment: 'Internal business workflow status for order processing'
        },
        
        // Human-readable description of the payment
        description: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: 'Description of what the payment is for'
        },
        
        // Additional metadata stored as JSON
        metadata: {
            type: DataTypes.JSONB, // JSONB for better performance in PostgreSQL
            allowNull: true,
            comment: 'Additional payment metadata, order details, internal notes, etc.'
        },
    }, {
        tableName: 'payment_transactions', // Explicit table name
        timestamps: true, // Adds createdAt and updatedAt fields
        comment: 'Payment transactions processed through the marketplace platform',
        
        // Database indexes for better query performance
        indexes: [
            {
                fields: ['companyId'], // Index for company-specific queries
            },
            {
                fields: ['customer'], // Index for customer-specific queries
            },
            {
                fields: ['status'], // Index for status-based filtering
            },
            {
                fields: ['createdAt'], // Index for date-based queries
            },
            {
                fields: ['stripePaymentIntentId'], // Already unique, but explicit index
                unique: true
            }
        ]
    });

    return PaymentTransaction;
};