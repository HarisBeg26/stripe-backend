# Stripe Backend Service

A Node.js backend service for handling Stripe payments, company management, and webhook processing in a marketplace platform.

## 🚀 Features

- **Payment Processing**: Create and manage Stripe Payment Intents with marketplace functionality
- **Company Management**: Full CRUD operations for marketplace companies/merchants  
- **Stripe Connect**: Onboard companies to receive payments through Stripe Connect
- **Webhook Handling**: Process Stripe webhook events to keep data synchronized
- **Payment History**: Track and query payment transactions with filtering options
- **Internal Workflow**: Manage internal business status separate from payment status
- **API Documentation**: Interactive Swagger documentation

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL with Sequelize ORM
- **Payment Processing**: Stripe API & Webhooks
- **Documentation**: Swagger UI
- **Containerization**: Docker & Docker Compose

## 📁 Project Structure

```
src/
├── app.js                          # Main application entry point
├── controllers/
│   ├── companyController.js        # Company CRUD operations
│   ├── stripeController.js         # Payment processing logic
│   └── stripeWebhookController.js  # Webhook event handling
├── models/
│   ├── company.js                  # Company data model
│   └── PaymentTransaction.js      # Payment transaction model
└── routes/
    ├── companyRoutes.js           # Company API endpoints
    ├── stripeRoute.js             # Payment API endpoints
    └── stripeWebhookRoutes.js     # Webhook endpoints
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- PostgreSQL database
- Stripe account with API keys
- Docker (optional)

### Environment Variables

Create a `.env` file with the following variables:

```env
# Application
APP_BASE_URL=http://localhost:3000
PORT=3000

# Database
DATABASE_URL=postgres://username:password@host:port/database

# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key  
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Subscription Plans (optional)
STRIPE_PRICE_BASIC_PLAN_ID=price_basic_plan_id
STRIPE_PRICE_PREMIUM_PLAN_ID=price_premium_plan_id

# External Services (optional)
LOGGING_SERVICE_URL=https://your-logging-service.com/log
NOTIFICATION_SERVICE_URL=https://your-notification-service.com/notify
```

### Installation & Running

#### Option 1: Docker (Recommended)

```bash
# Build and start the service
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the service  
docker-compose down
```

#### Option 2: Local Development

```bash
# Install dependencies
npm install

# Start development server with auto-reload
npm run dev

# Or start production server
npm start
```

The service will be available at `http://localhost:3000`

## 📚 API Documentation

Interactive API documentation is available at `http://localhost:3000/api-docs` when the service is running.

### Key Endpoints

#### Companies
- `GET /api/companies` - List all companies
- `POST /api/companies` - Create new company
- `GET /api/companies/:id` - Get company details
- `PUT /api/companies/:id` - Update company
- `POST /api/companies/:id/stripe-onboard` - Initiate Stripe onboarding

#### Payments
- `POST /api/stripe/create-payment-intent` - Create payment intent
- `GET /api/stripe/transactions/company/:companyId` - Get payment history
- `GET /api/stripe/transactions/:transactionId` - Get transaction details
- `PUT /api/stripe/transactions/:transactionId/internal-status` - Update internal status

#### Webhooks
- `POST /api/stripe/webhook` - Stripe webhook endpoint

## 🔧 Configuration

### Stripe Webhook Setup

1. In your Stripe Dashboard, go to Developers → Webhooks
2. Add endpoint: `https://yourdomain.com/api/stripe/webhook`
3. Select events to listen for:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`

### Database Schema

The service automatically creates the following tables:

- **companies**: Stores company/merchant information
- **payment_transactions**: Tracks all payment transactions with both Stripe and internal status

## 🔒 Security Features

- Webhook signature verification
- Input validation and sanitization
- UUID primary keys
- Environment variable configuration
- CORS configuration

## 🏗️ Development

### Adding New Features

1. **Models**: Add new data models in `src/models/`
2. **Controllers**: Implement business logic in `src/controllers/`
3. **Routes**: Define API endpoints in `src/routes/`
4. **Documentation**: Update Swagger documentation

### Code Style

The codebase includes comprehensive comments explaining:
- Function purposes and parameters
- Business logic and workflow
- Security considerations
- Database relationships
- API endpoint documentation

## 🚨 Production Considerations

- Remove or secure test endpoints (`/test-payment-table`)
- Implement proper logging and monitoring
- Set up database backups
- Configure SSL/TLS certificates
- Restrict CORS origins to your domains
- Implement rate limiting
- Set up error tracking (Sentry, etc.)

## 📝 License

This project is licensed under the MIT License.
