/**
 * Company Model
 * 
 * Represents companies/merchants in the marketplace system.
 * Companies can receive payments through Stripe Connect and manage subscriptions.
 * 
 * @param {Sequelize} sequelize - The Sequelize instance
 * @param {DataTypes} DataTypes - Sequelize data types
 * @returns {Model} Company model
 */
module.exports = (sequelize, DataTypes) => {
    const Company = sequelize.define('Company', {
        // Primary key: UUID for better security and scalability
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        
        // Company name - must be unique across platform
        name: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            comment: 'Company or business name - must be unique'
        },
        
        // Primary email for the company account
        email: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            validate: {
                isEmail: true, // Built-in email validation
            },
            comment: 'Primary contact email - used for Stripe account creation'
        },
        
        // Stripe Connect account ID for marketplace payments
        stripeAccountId: {
            type: DataTypes.STRING,
            allowNull: true, // Can be null until Stripe onboarding is complete
            unique: true,
            comment: 'Stripe Connect account ID for receiving marketplace payments'
        },

        // Stripe Customer ID for subscription billing
        stripeCustomerId: {
            type: DataTypes.STRING,
            allowNull: true,
            unique: true,
            comment: 'Stripe Customer ID for managing subscriptions'
        },

        // Stripe Subscription ID
        stripeSubscriptionId: {
            type: DataTypes.STRING,
            allowNull: true,
            unique: true,
            comment: 'Stripe Subscription ID for the current active subscription'
        },

        // Subscription status (e.g., active, past_due, canceled)
        subscriptionStatus: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: 'Subscription status from Stripe (e.g., active, canceled)'
        },

        // Access level based on subscription plan
        accessLevel: {
            type: DataTypes.STRING,
            defaultValue: 'free',
            allowNull: false,
            comment: 'Access level granted by the subscription (e.g., free, basic, premium)'
        },

        // Subscription expiration or renewal date
        subscriptionExpiresAt: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: 'Date when the current subscription period ends or expired'
        },
        
        // Optional company address
        address: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: 'Company physical address'
        },
        
        // Optional contact phone number
        phone: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: 'Company contact phone number'
        },
    }, {
        tableName: 'companies', // Explicit table name
        timestamps: true, // Adds createdAt and updatedAt fields
        comment: 'Companies/merchants that can receive payments through the marketplace'
    });

    return Company;
};