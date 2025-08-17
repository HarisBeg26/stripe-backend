/**
 * Company API Routes
 * 
 * Provides CRUD operations for managing companies in the marketplace.
 * Companies represent merchants/businesses that can receive payments.
 * 
 * All routes are prefixed with /api/companies when mounted in app.js
 */

const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');
const { parseGatewayHeaders, authorizeCompanyAccess, hasRole } = require('../middleware/gatewayAuth');

/**
 * GET /api/companies
 * Retrieves a list of all companies
 */
router.get('/', [parseGatewayHeaders, hasRole(['admin'])], companyController.getAllCompanies);

/**
 * GET /api/companies/:id
 * Retrieves detailed information for a specific company
 */
router.get('/:id', [parseGatewayHeaders, authorizeCompanyAccess], companyController.getCompanyById);

/**
 * POST /api/companies
 * Creates a new company record
 * Body: { name, email, address?, phone? }
 */
router.post('/', [parseGatewayHeaders, hasRole(['admin'])], companyController.createCompany);

/**
 * PUT /api/companies/:id
 * Updates an existing company record
 * Body: { name?, email?, address?, phone? }
 */
router.put('/:id', [parseGatewayHeaders, authorizeCompanyAccess], companyController.updateCompany);

/**
 * DELETE /api/companies/:id
 * Deletes a company record (soft delete recommended in production)
 */
router.delete('/:id', [parseGatewayHeaders, hasRole(['admin'])], companyController.deleteCompany);

/**
 * POST /api/companies/:id/initiate-stripe-onboarding
 * Initiates Stripe Connect onboarding process for a company
 * Creates Stripe Connect account and returns onboarding URL
 */
router.post('/:id/initiate-stripe-onboarding', [parseGatewayHeaders, authorizeCompanyAccess], companyController.initiateStripeOnboarding);

module.exports = router;