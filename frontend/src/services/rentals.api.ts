import type { Rental, RentalDetail, RentalStatus } from '@/types';
import { http, toQuery } from './http';

export const rentalsApi = {
  list: (status?: RentalStatus) => http<Rental[]>(`/rentals${toQuery({ status })}`),
  get: (id: string) => http<RentalDetail>(`/rentals/${id}`),
};
