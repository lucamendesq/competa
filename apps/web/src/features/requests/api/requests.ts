import { api } from '@/api/client'

export const downloadRequestZip = (requestId: string, filename: string) =>
  api.download(`/requests/${requestId}/zip`, filename)

export const resendUploadLink = (requestId: string) =>
  api.post<{ contactEmail: string }>(`/requests/${requestId}/resend`)
