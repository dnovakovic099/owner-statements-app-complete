const request = require('supertest');
const express = require('express');

// Mock services
jest.mock('../../services/FileDataService');
jest.mock('../../services/HostifyService');

const FileDataService = require('../../services/FileDataService');
const HostifyService = require('../../services/HostifyService');

// Create a minimal express app for testing
const app = express();
app.use(express.json());

// Mock basic auth middleware
app.use((req, res, next) => {
  req.user = { username: 'testuser' };
  next();
});

// Import the router (you may need to adjust the path)
const statementsRouter = require('../statements-file');
app.use('/api/statements', statementsRouter);

describe('Cancelled Reservations Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/statements/:id/cancelled-reservations', () => {
    const mockStatement = {
      id: 1,
      propertyId: 100,
      propertyIds: null,
      weekStartDate: '2025-01-01',
      weekEndDate: '2025-01-31',
      reservations: [],
    };

    const mockCancelledReservations = [
      {
        hostifyId: '12345',
        propertyId: 100,
        guestName: 'John Doe',
        checkInDate: '2025-01-10',
        checkOutDate: '2025-01-15',
        status: 'cancelled',
        clientRevenue: 500,
        source: 'Airbnb',
      },
      {
        hostifyId: '12346',
        propertyId: 100,
        guestName: 'Jane Smith',
        checkInDate: '2025-01-20',
        checkOutDate: '2025-01-25',
        status: 'cancelled',
        clientRevenue: 600,
        source: 'Direct',
      },
    ];

    it('should return cancelled reservations for valid statement', async () => {
      FileDataService.getStatementById.mockResolvedValue(mockStatement);
      HostifyService.getAllReservations.mockResolvedValue({
        result: mockCancelledReservations,
      });

      const response = await request(app)
        .get('/api/statements/1/cancelled-reservations')
        .expect(200);

      expect(response.body.count).toBe(2);
      expect(response.body.cancelledReservations).toHaveLength(2);
      expect(response.body.statementPeriod.start).toBe('2025-01-01');
      expect(response.body.statementPeriod.end).toBe('2025-01-31');
    });

    it('should return 404 for non-existent statement', async () => {
      FileDataService.getStatementById.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/statements/999/cancelled-reservations')
        .expect(404);

      expect(response.body.error).toBe('Statement not found');
    });

    it('should filter by property ID', async () => {
      const mixedReservations = [
        ...mockCancelledReservations,
        {
          hostifyId: '99999',
          propertyId: 999, // Different property
          guestName: 'Other Guest',
          checkInDate: '2025-01-10',
          checkOutDate: '2025-01-15',
          status: 'cancelled',
          clientRevenue: 700,
          source: 'Booking',
        },
      ];

      FileDataService.getStatementById.mockResolvedValue(mockStatement);
      HostifyService.getAllReservations.mockResolvedValue({
        result: mixedReservations,
      });

      const response = await request(app)
        .get('/api/statements/1/cancelled-reservations')
        .expect(200);

      // Should only return reservations for property 100
      expect(response.body.count).toBe(2);
      expect(response.body.cancelledReservations.every(r => r.propertyId === 100)).toBe(true);
    });

    it('should only include reservations that overlap with statement period', async () => {
      const reservationsWithDates = [
        {
          hostifyId: '1',
          propertyId: 100,
          guestName: 'In Period',
          checkInDate: '2025-01-10',
          checkOutDate: '2025-01-15',
          status: 'cancelled',
        },
        {
          hostifyId: '2',
          propertyId: 100,
          guestName: 'Before Period',
          checkInDate: '2024-12-01',
          checkOutDate: '2024-12-05',
          status: 'cancelled',
        },
        {
          hostifyId: '3',
          propertyId: 100,
          guestName: 'After Period',
          checkInDate: '2025-02-10',
          checkOutDate: '2025-02-15',
          status: 'cancelled',
        },
        {
          hostifyId: '4',
          propertyId: 100,
          guestName: 'Spanning Period',
          checkInDate: '2024-12-20',
          checkOutDate: '2025-02-05',
          status: 'cancelled',
        },
      ];

      FileDataService.getStatementById.mockResolvedValue(mockStatement);
      HostifyService.getAllReservations.mockResolvedValue({
        result: reservationsWithDates,
      });

      const response = await request(app)
        .get('/api/statements/1/cancelled-reservations')
        .expect(200);

      // Should include "In Period" and "Spanning Period", exclude "Before Period" and "After Period"
      expect(response.body.count).toBe(2);
      const guestNames = response.body.cancelledReservations.map(r => r.guestName);
      expect(guestNames).toContain('In Period');
      expect(guestNames).toContain('Spanning Period');
      expect(guestNames).not.toContain('Before Period');
      expect(guestNames).not.toContain('After Period');
    });

    it('should mark reservations already in statement', async () => {
      const statementWithReservation = {
        ...mockStatement,
        reservations: [{ hostifyId: '12345' }],
      };

      FileDataService.getStatementById.mockResolvedValue(statementWithReservation);
      HostifyService.getAllReservations.mockResolvedValue({
        result: mockCancelledReservations,
      });

      const response = await request(app)
        .get('/api/statements/1/cancelled-reservations')
        .expect(200);

      const johnDoeReservation = response.body.cancelledReservations.find(
        r => r.hostifyId === '12345'
      );
      const janeSmithReservation = response.body.cancelledReservations.find(
        r => r.hostifyId === '12346'
      );

      expect(johnDoeReservation.alreadyInStatement).toBe(true);
      expect(janeSmithReservation.alreadyInStatement).toBe(false);
    });
  });

  describe('POST /api/statements/cancelled-counts', () => {
    it('should return cancelled counts for multiple statements', async () => {
      const statements = [
        { id: 1, propertyId: 100, weekStartDate: '2025-01-01', weekEndDate: '2025-01-31' },
        { id: 2, propertyId: 200, weekStartDate: '2025-01-01', weekEndDate: '2025-01-31' },
      ];

      const reservations = [
        { hostifyId: '1', propertyId: 100, checkInDate: '2025-01-10', checkOutDate: '2025-01-15', status: 'cancelled' },
        { hostifyId: '2', propertyId: 100, checkInDate: '2025-01-20', checkOutDate: '2025-01-25', status: 'cancelled' },
        { hostifyId: '3', propertyId: 200, checkInDate: '2025-01-05', checkOutDate: '2025-01-10', status: 'cancelled' },
      ];

      FileDataService.getStatementById
        .mockResolvedValueOnce(statements[0])
        .mockResolvedValueOnce(statements[1]);

      HostifyService.getAllReservations.mockResolvedValue({ result: reservations });

      const response = await request(app)
        .post('/api/statements/cancelled-counts')
        .send({ statementIds: [1, 2] })
        .expect(200);

      expect(response.body.counts[1]).toBe(2); // Statement 1 has 2 cancelled
      expect(response.body.counts[2]).toBe(1); // Statement 2 has 1 cancelled
    });

    it('should return empty counts for empty statementIds array', async () => {
      const response = await request(app)
        .post('/api/statements/cancelled-counts')
        .send({ statementIds: [] })
        .expect(200);

      expect(response.body.counts).toEqual({});
    });

    it('should handle missing statementIds gracefully', async () => {
      const response = await request(app)
        .post('/api/statements/cancelled-counts')
        .send({})
        .expect(200);

      expect(response.body.counts).toEqual({});
    });

    it('should skip non-existent statements', async () => {
      FileDataService.getStatementById
        .mockResolvedValueOnce({ id: 1, propertyId: 100, weekStartDate: '2025-01-01', weekEndDate: '2025-01-31' })
        .mockResolvedValueOnce(null); // Statement 2 doesn't exist

      HostifyService.getAllReservations.mockResolvedValue({ result: [] });

      const response = await request(app)
        .post('/api/statements/cancelled-counts')
        .send({ statementIds: [1, 999] })
        .expect(200);

      expect(response.body.counts).toHaveProperty('1');
      expect(response.body.counts).not.toHaveProperty('999');
    });
  });

  describe('GET /api/statements/:id (with cancelledReservationCount)', () => {
    it('should include cancelledReservationCount in statement response', async () => {
      const mockStatement = {
        id: 1,
        propertyId: 100,
        weekStartDate: '2025-01-01',
        weekEndDate: '2025-01-31',
        status: 'draft',
      };

      const cancelledReservations = [
        { hostifyId: '1', propertyId: 100, checkInDate: '2025-01-10', checkOutDate: '2025-01-15', status: 'cancelled' },
      ];

      FileDataService.getStatementById.mockResolvedValue(mockStatement);
      HostifyService.getAllReservations.mockResolvedValue({ result: cancelledReservations });

      const response = await request(app)
        .get('/api/statements/1')
        .expect(200);

      expect(response.body.cancelledReservationCount).toBe(1);
    });

    it('should return 0 cancelledReservationCount when no cancelled reservations', async () => {
      const mockStatement = {
        id: 1,
        propertyId: 100,
        weekStartDate: '2025-01-01',
        weekEndDate: '2025-01-31',
        status: 'draft',
      };

      FileDataService.getStatementById.mockResolvedValue(mockStatement);
      HostifyService.getAllReservations.mockResolvedValue({ result: [] });

      const response = await request(app)
        .get('/api/statements/1')
        .expect(200);

      expect(response.body.cancelledReservationCount).toBe(0);
    });
  });
});

describe('Statement Status Update', () => {
  describe('PUT /api/statements/:id/status', () => {
    const mockStatement = {
      id: 1,
      propertyId: 100,
      status: 'sent',
    };

    it('should allow changing status from sent to draft', async () => {
      FileDataService.getStatementById.mockResolvedValue(mockStatement);
      FileDataService.saveStatement.mockResolvedValue(true);

      const response = await request(app)
        .put('/api/statements/1/status')
        .send({ status: 'draft' })
        .expect(200);

      expect(response.body.message).toBe('Statement status updated successfully');
    });

    it('should allow changing status from final to draft', async () => {
      FileDataService.getStatementById.mockResolvedValue({ ...mockStatement, status: 'final' });
      FileDataService.saveStatement.mockResolvedValue(true);

      const response = await request(app)
        .put('/api/statements/1/status')
        .send({ status: 'draft' })
        .expect(200);

      expect(response.body.message).toBe('Statement status updated successfully');
    });

    it('should reject invalid status values', async () => {
      const response = await request(app)
        .put('/api/statements/1/status')
        .send({ status: 'invalid' })
        .expect(400);

      expect(response.body.error).toContain('Invalid status');
    });

    it('should return 404 for non-existent statement', async () => {
      FileDataService.getStatementById.mockResolvedValue(null);

      const response = await request(app)
        .put('/api/statements/999/status')
        .send({ status: 'draft' })
        .expect(404);

      expect(response.body.error).toBe('Statement not found');
    });
  });
});
