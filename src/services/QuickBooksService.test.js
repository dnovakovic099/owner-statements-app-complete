const QuickBooksService = require('./QuickBooksService');

describe('QuickBooksService', () => {
  let quickBooksService;

  beforeEach(() => {
    // Mock environment variables
    process.env.QUICKBOOKS_COMPANY_ID = 'test-company-id';
    process.env.QUICKBOOKS_ACCESS_TOKEN = 'test-access-token';
    process.env.QUICKBOOKS_REFRESH_TOKEN = 'test-refresh-token';
    process.env.QUICKBOOKS_CLIENT_ID = 'test-client-id';
    process.env.QUICKBOOKS_CLIENT_SECRET = 'test-client-secret';
    process.env.QUICKBOOKS_REDIRECT_URI = 'http://localhost:3003/api/quickbooks/auth/callback';
    
    quickBooksService = new QuickBooksService();
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.QUICKBOOKS_COMPANY_ID;
    delete process.env.QUICKBOOKS_ACCESS_TOKEN;
    delete process.env.QUICKBOOKS_REFRESH_TOKEN;
    delete process.env.QUICKBOOKS_CLIENT_ID;
    delete process.env.QUICKBOOKS_CLIENT_SECRET;
    delete process.env.QUICKBOOKS_REDIRECT_URI;
  });

  describe('constructor', () => {
    it('should initialize with default departments', () => {
      expect(quickBooksService.defaultDepartments).toContain('Maintenance');
      expect(quickBooksService.defaultDepartments).toContain('Cleaning');
      expect(quickBooksService.defaultDepartments).toContain('Utilities');
      expect(quickBooksService.defaultDepartments).toContain('Marketing');
      expect(quickBooksService.defaultDepartments).toContain('Management');
    });

    it('should set environment variables correctly', () => {
      expect(quickBooksService.companyId).toBe('test-company-id');
      expect(quickBooksService.accessToken).toBe('test-access-token');
      expect(quickBooksService.refreshToken).toBe('test-refresh-token');
      expect(quickBooksService.clientId).toBe('test-client-id');
      expect(quickBooksService.clientSecret).toBe('test-client-secret');
    });
  });

  describe('formatTransactions', () => {
    it('should format transactions correctly', () => {
      const mockTransactions = [
        {
          Id: '123',
          TxnDate: '2023-01-15',
          TotalAmt: 100.50,
          DocNumber: 'INV-001',
          PrivateNote: 'Test transaction',
          TxnType: 'Invoice',
          Line: [
            {
              AccountRef: {
                name: 'Sales',
                type: 'Income'
              }
            }
          ]
        }
      ];

      const formatted = quickBooksService.formatTransactions(mockTransactions);
      
      expect(formatted).toHaveLength(1);
      expect(formatted[0]).toEqual({
        id: '123',
        date: '2023-01-15',
        amount: 100.50,
        description: 'INV-001',
        account: 'Sales',
        accountType: 'Income',
        type: 'Invoice',
        department: null,
        propertyId: null,
        categorized: false,
        raw: mockTransactions[0]
      });
    });

    it('should handle transactions without DocNumber', () => {
      const mockTransactions = [
        {
          Id: '124',
          TxnDate: '2023-01-16',
          TotalAmt: -50.25,
          PrivateNote: 'Expense transaction',
          TxnType: 'Expense',
          Line: [
            {
              AccountRef: {
                name: 'Office Supplies',
                type: 'Expense'
              }
            }
          ]
        }
      ];

      const formatted = quickBooksService.formatTransactions(mockTransactions);
      
      expect(formatted[0].description).toBe('Expense transaction');
      expect(formatted[0].amount).toBe(-50.25);
    });
  });

  describe('getAuthorizationUrl', () => {
    it('should generate correct authorization URL', () => {
      const authUrl = quickBooksService.getAuthorizationUrl();
      
      expect(authUrl).toContain('https://appcenter.intuit.com/connect/oauth2');
      expect(authUrl).toContain('client_id=test-client-id');
      expect(authUrl).toContain('scope=com.intuit.quickbooks.accounting');
      expect(authUrl).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3003%2Fapi%2Fquickbooks%2Fauth%2Fcallback');
      expect(authUrl).toContain('response_type=code');
      expect(authUrl).toContain('access_type=offline');
    });
  });

  describe('getDepartments', () => {
    it('should return default departments when QuickBooks call fails', async () => {
      // Mock the makeRequest method to throw an error
      quickBooksService.makeRequest = jest.fn().mockRejectedValue(new Error('API Error'));
      
      const departments = await quickBooksService.getDepartments();
      
      expect(departments).toHaveLength(quickBooksService.defaultDepartments.length);
      expect(departments[0]).toEqual({ Name: 'Maintenance', Id: null });
      expect(departments[1]).toEqual({ Name: 'Cleaning', Id: null });
    });

    it('should merge QuickBooks departments with defaults', async () => {
      const mockQuickBooksResponse = {
        data: {
          QueryResponse: {
            Department: [
              { Id: '1', Name: 'Custom Department' }
            ]
          }
        }
      };

      quickBooksService.makeRequest = jest.fn().mockResolvedValue(mockQuickBooksResponse);
      
      const departments = await quickBooksService.getDepartments();
      
      // Should have the custom department plus all default departments
      expect(departments).toHaveLength(quickBooksService.defaultDepartments.length + 1);
      expect(departments.find(d => d.Name === 'Custom Department')).toBeDefined();
      expect(departments.find(d => d.Name === 'Maintenance')).toBeDefined();
    });
  });
});

// Mock axios for testing
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    defaults: {}
  }))
}));

