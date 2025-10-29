const request = require('supertest');
const { app, setupDatabase } = require('./index');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Mock external dependencies
jest.mock('axios');
jest.mock('@google/generative-ai');

const mockGenerateContent = jest.fn();

describe('Menu Summarizer API', () => {
  let db;

  beforeAll(async () => {
    // Use an in-memory database for tests
    db = await setupDatabase(':memory:');
  });

  beforeEach(() => {
    // Reset mocks before each test
    axios.get.mockClear();
    mockGenerateContent.mockClear();
    GoogleGenerativeAI.mockImplementation(() => ({
      getGenerativeModel: () => ({
        generateContent: mockGenerateContent,
      }),
    }));
  });

  // Integration Test
  it('should handle a cache miss, scrape, call AI, and return data', async () => {
    const mockUrl = 'http://example.com';
    const mockHtml = '<html><body><h1>Test Menu</h1><p>Polévka: Gulášová - 50 Kč</p></body></html>';
    const today = new Date().toISOString().split('T')[0];
    const mockAiResponse = {
      restaurant_name: 'Test Restaurant',
      menu_items: [{ category: 'Polévka', name: 'Gulášová', price: 50 }],
      daily_menu: true,
      source_url: mockUrl,
      date: today,
    };

    axios.get.mockResolvedValue({ data: mockHtml });
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => JSON.stringify(mockAiResponse),
      },
    });

    const response = await request(app)
      .post('/summarize')
      .send({ url: mockUrl });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(mockAiResponse);
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  // Caching Test
  it('should hit the cache on the second request', async () => {
    const mockUrl = 'http://example.com/cached';
    const today = new Date().toISOString().split('T')[0];
    const mockAiResponse = {
      restaurant_name: 'Cached Restaurant',
      menu_items: [{ category: 'Hlavní jídlo', name: 'Řízek', price: 150 }],
      daily_menu: true,
      source_url: mockUrl,
      date: today,
    };

    axios.get.mockResolvedValue({ data: '<html></html>' });
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => JSON.stringify(mockAiResponse),
      },
    });

    // First call (should be a cache miss)
    await request(app).post('/summarize').send({ url: mockUrl });

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);

    // Second call (should be a cache hit)
    const response = await request(app).post('/summarize').send({ url: mockUrl });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(mockAiResponse);
    // AI should NOT be called again
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  // Unit Test (example)
  it('should return 400 if URL is missing', async () => {
    const response = await request(app)
      .post('/summarize')
      .send({});
    
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBe('URL is required');
  });
});
