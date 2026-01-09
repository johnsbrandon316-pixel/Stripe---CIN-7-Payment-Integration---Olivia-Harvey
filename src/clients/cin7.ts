import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../config';
import logger from '../logger';

export interface Cin7Sale {
  id: number;
  saleID: string;
  reference?: string;
  status?: string;
  total?: number;
  balance?: number;
  customer?: {
    id: number;
    name: string;
    email?: string;
  };
  createdDate?: string;
  note?: string;
  customField1?: string;
  customField2?: string;
}

export interface Cin7PaymentPayload {
  saleID: number;
  amount: number;
  paymentDate: string;
  reference: string;
  notes?: string;
}

export interface Cin7UpdateSalePayload {
  id: number;
  note?: string;
  customField1?: string;
  customField2?: string;
}

export class Cin7Client {
  private client: AxiosInstance;

  constructor() {
    if (!config.CIN7_API_KEY) {
      throw new Error('CIN7_API_KEY is required');
    }

    this.client = axios.create({
      baseURL: config.CIN7_BASE_URL,
      headers: {
        'Authorization': `Bearer ${config.CIN7_API_KEY}`,
        'Content-Type': 'application/json',
        ...(config.CIN7_TENANT && { 'X-Cin7-Tenant': config.CIN7_TENANT }),
      },
      timeout: 30000,
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        logger.error({
          msg: 'Cin7 API error',
          status: error.response?.status,
          data: error.response?.data,
          url: error.config?.url,
        });
        throw error;
      }
    );
  }

  /**
   * Get sales with optional filters
   */
  async getSales(params?: {
    status?: string;
    createdFrom?: string;
    createdTo?: string;
    page?: number;
    rows?: number;
  }): Promise<Cin7Sale[]> {
    try {
      logger.info({ msg: 'Fetching sales from Cin7', params });
      const response = await this.client.get('/api/v1/Sales', { params });
      return response.data;
    } catch (error) {
      logger.error({ msg: 'Failed to fetch sales', error });
      throw error;
    }
  }

  /**
   * Get a single sale by ID
   */
  async getSaleById(id: number): Promise<Cin7Sale> {
    try {
      logger.info({ msg: 'Fetching sale by ID', id });
      const response = await this.client.get(`/api/v1/Sales/${id}`);
      return response.data;
    } catch (error) {
      logger.error({ msg: 'Failed to fetch sale', id, error });
      throw error;
    }
  }

  /**
   * Update sale fields (note or custom fields for payment link)
   */
  async updateSale(payload: Cin7UpdateSalePayload): Promise<Cin7Sale> {
    try {
      logger.info({ msg: 'Updating sale', saleId: payload.id });
      const response = await this.client.put(`/api/v1/Sales/${payload.id}`, payload);
      return response.data;
    } catch (error) {
      logger.error({ msg: 'Failed to update sale', saleId: payload.id, error });
      throw error;
    }
  }

  /**
   * Post a payment to Cin7 using SalePayments endpoint
   */
  async postPayment(payload: Cin7PaymentPayload): Promise<any> {
    try {
      logger.info({
        msg: 'Posting payment to Cin7',
        saleID: payload.saleID,
        amount: payload.amount,
        reference: payload.reference,
      });
      const response = await this.client.post('/api/v1/SalePayments', payload);
      logger.info({ msg: 'Payment posted successfully', saleID: payload.saleID });
      return response.data;
    } catch (error) {
      logger.error({ msg: 'Failed to post payment', saleID: payload.saleID, error });
      throw error;
    }
  }
}

export const cin7Client = new Cin7Client();
