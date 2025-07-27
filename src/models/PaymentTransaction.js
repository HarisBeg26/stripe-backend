module.exports = (sequelize, DataTypes) => {
    const PaymentTransaction = sequelize.define('PaymentTransaction', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        companyId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'companies',
                key: 'id',
            }
        },
        customer: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        amount: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        currency: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'eur',
        },
        stripePaymentIntentId: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        status: {
            type: DataTypes.ENUM('pending', 'succeeded', 'failed', 'canceled', 'refunded'),
            defaultValue: 'pending',
            allowNull: false,
        },
        internalStatus: {
            type: DataTypes.ENUM('awaiting_approval', 'approved', 'rejected', 'fulfilled', 'canceled_by_business'),
            defaultValue: 'awaiting_approval',
            allowNull: false,
        },
        description: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        metadata: {
            type: DataTypes.JSONB,
            allowNull: true,
        },
    }, {
        tableName: 'payment_transactions',
        timestamps: true,
    });

    return PaymentTransaction;
};