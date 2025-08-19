# Authentication & Authorization System

This Stripe backend service now includes a comprehensive JWT-based authentication and authorization system.

## Features

### 🔐 Authentication
- **JWT Token-based Authentication**: Secure stateless authentication using JSON Web Tokens
- **Password Hashing**: Bcrypt with salt rounds for secure password storage
- **Login/Registration**: Complete user registration and login flow
- **Password Reset**: Secure password reset with time-limited tokens
- **Rate Limiting**: Protection against brute force attacks

### 🛡️ Authorization
- **Role-based Access Control**: Admin, Manager, User roles
- **Company-level Authorization**: Users can only access their company's resources
- **Subscription-level Authorization**: Feature access based on subscription tier
- **Resource Protection**: All sensitive endpoints require proper authorization

### 🔒 Security Features
- **Helmet.js**: Security headers for XSS, clickjacking protection
- **CORS Configuration**: Configurable cross-origin resource sharing
- **Rate Limiting**: API and authentication endpoint protection
- **Token Expiration**: Configurable JWT token expiry

## API Endpoints

### Public Endpoints (No Authentication Required)
```
POST /api/users/register     - User registration
POST /api/users/login        - User login
POST /api/users/forgot-password - Request password reset
POST /api/users/reset-password  - Reset password with token
```

### Protected Endpoints (Authentication Required)
```
GET  /api/users/me           - Get current user profile
POST /api/users/change-password - Change password
GET  /api/users/payment-history - Get user payment history
GET  /api/users/:id          - Get user by ID (company access required)
```

### Company Endpoints (Authentication + Authorization Required)
```
GET    /api/companies        - List all companies (admin only)
GET    /api/companies/:id    - Get company details (company access required)
POST   /api/companies        - Create company (admin only)
PUT    /api/companies/:id    - Update company (company access required)
DELETE /api/companies/:id    - Delete company (admin only)
POST   /api/companies/:id/initiate-stripe-onboarding - Stripe onboarding
```

### Stripe Endpoints (Authentication + Authorization Required)
```
POST /api/stripe/create-payment-intent - Create payment (company access required)
POST /api/stripe/create-subscription-checkout - Create subscription (company access required)
GET  /api/stripe/transactions/company/:companyId - Payment history (company access required)
GET  /api/stripe/transactions/:transactionId - Transaction details (authenticated)
PUT  /api/stripe/transactions/:transactionId/internal-status - Update status (basic/premium subscription required)
GET  /api/stripe/test-payment-table - Test endpoint (admin only)
DELETE /api/stripe/subscriptions/:subscriptionId - Cancel subscription (company access required)
```

## Usage

### 1. User Registration
```javascript
POST /api/users/register
{
  "firstName": "John",
  "lastName": "Doe", 
  "email": "john@company.com",
  "password": "securepassword",
  "phone": "+1234567890",
  "companyId": "uuid-of-company"
}

Response:
{
  "user": {
    "id": "user-uuid",
    "email": "john@company.com",
    "companyId": "company-uuid",
    "role": "user"
  },
  "token": "jwt-token-here"
}
```

### 2. User Login
```javascript
POST /api/users/login
{
  "email": "john@company.com",
  "password": "securepassword"
}

Response:
{
  "user": {
    "id": "user-uuid",
    "email": "john@company.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "user",
    "companyId": "company-uuid",
    "company": {
      "id": "company-uuid",
      "name": "Company Name",
      "subscriptionStatus": "active",
      "accessLevel": "premium"
    }
  },
  "token": "jwt-token-here"
}
```

### 3. Making Authenticated Requests
Include the JWT token in the Authorization header:
```
Authorization: Bearer <jwt-token>
```

### 4. Password Reset Flow
```javascript
// Step 1: Request reset
POST /api/users/forgot-password
{
  "email": "john@company.com"
}

// Step 2: Reset with token
POST /api/users/reset-password
{
  "token": "reset-token-from-email",
  "newPassword": "newsecurepassword"
}
```

## Authorization Levels

### User Roles
- **admin**: Full system access, can manage all companies and users
- **manager**: Company-level management access
- **user**: Basic user access to own company resources

### Subscription Levels
- **free**: Basic access
- **basic**: Enhanced features
- **premium**: Full feature access

## Environment Variables

Required environment variables for authentication:
```
JWT_SECRET=your_super_secure_jwt_secret_key_at_least_32_characters
JWT_EXPIRES_IN=24h
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

## Security Considerations

1. **JWT Secret**: Use a strong, randomly generated secret key (minimum 32 characters)
2. **Token Expiry**: Configure appropriate token expiration times
3. **HTTPS**: Always use HTTPS in production
4. **Rate Limiting**: Configured to prevent abuse
5. **Password Policy**: Minimum 6 characters (consider strengthening in production)
6. **CORS**: Configure allowed origins for production

## Error Responses

Common authentication/authorization error responses:
- `401 Unauthorized`: Missing or invalid token, invalid credentials
- `403 Forbidden`: Insufficient permissions for the requested resource
- `429 Too Many Requests`: Rate limit exceeded
