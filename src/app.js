require('dotenv').config();

const express = require('express');
const {Sequelize, DataTypes} = require('sequelize');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const bodyParser = require('body-parser');

const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load('./swagger.yaml');

const companyRoutes = require('./routes/companyRoutes');
const stripeRoutes = require('./routes/stripeRoute');
const stripeWebhookRoutes = require('./routes/stripeWebhookRoutes');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false
        }
    }
});

const Company = require('./models/Company')(sequelize, DataTypes);
const PaymentTransaction = require('./models/PaymentTransaction')(sequelize, DataTypes);

Company.hasMany(PaymentTransaction, {foreignKey: 'companyId'});
PaymentTransaction.belongsTo(Company, {foreignKey: 'companyId'});

sequelize.authenticate().then(() => {
    console.log('Sequelize authenticated successfully.');
    return sequelize.sync();
}).then(() => {
    console.log('Database synchronized successfully.');
}).catch((err) => {
    console.error('Unable to connect to the database:', err);
    process.exit(1);
});

app.use((req, res, next) => {
    req.db = {
        Company,
        PaymentTransaction
    };
    next();
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
console.log(`Access documentation at http://localhost:${port}/api-docs`);
app.use('/api/companies', companyRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/stripe/webhook', stripeWebhookRoutes);

app.get('/', (req, res) => {
    res.send('Company Service is running!');
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});