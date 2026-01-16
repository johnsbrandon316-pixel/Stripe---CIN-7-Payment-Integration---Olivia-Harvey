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
      baseURL: config.CIN7_BASE_URL || 'https://inventory.dearsystems.com/ExternalApi/v2/',
      headers: {
        'Content-Type': 'application/json',
        'api-auth-accountid': config.CIN7_TENANT,
        'api-auth-applicationkey': config.CIN7_API_KEY,
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
    modifiedSince?: string;
    limit?: number;
    page?: number;
    rows?: number;
  }): Promise<any[]> {
    try {
      logger.info({ msg: 'Fetching sales from Cin7', params });
      
      // Map our params to Cin7 API params
      const cin7Params: any = {
        Page: params?.page || 1,
        Limit: params?.limit || params?.rows || 100,
      };
      
      if (params?.status) {
        cin7Params.Status = params.status;
      }
      if (params?.createdFrom) {
        cin7Params.CreatedFrom = params.createdFrom;
      }
      if (params?.createdTo) {
        cin7Params.CreatedTo = params.createdTo;
      }
      if (params?.modifiedSince) {
        cin7Params.ModifiedSince = params.modifiedSince;
      }
      
      const response = await this.client.get('/SaleList', { params: cin7Params });
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
      const response = await this.client.get(`/SaleList?SaleID=${id}`);
      return response.data;
    } catch (error) {
      logger.error({ msg: 'Failed to fetch sale', id, error });
      throw error;
    }
  }

  /**
   * Update sale fields (note or custom fields for payment link)
   */
  async updateSale(id: number, data: { Note?: string; CustomField1?: string; CustomField2?: string }): Promise<any> {
    // Cin7 Core API does not support PUT to /SaleList, so this should be implemented according to the API docs if needed
    throw new Error('Update sale is not supported in Cin7 Core API v2.');
  }

  /**
   * Post a payment to Cin7 using SalePayments endpoint
   */
  async postPayment(payload: Cin7PaymentPayload): Promise<any> {
    logger.info({
      msg: 'Posting payment to Cin7',
      saleID: payload.saleID,
      amount: payload.amount,
      reference: payload.reference,
    });
    // Cin7 Core API does not support /SalePayments endpoint in v2, so this should be implemented according to the API docs if needed
    throw new Error('Post payment is not supported in Cin7 Core API v2.');
  }

  /**
   * Get company info (for testing credentials)
   */
  async getMe(): Promise<any> {
    try {
      logger.info({ msg: 'Fetching Cin7 Core company info' });
      const response = await this.client.get('/me');
      return response.data;
    } catch (error) {
      logger.error({ msg: 'Failed to fetch company info', error });
      throw error;
    }
  }
}

export const cin7Client = new Cin7Client();
