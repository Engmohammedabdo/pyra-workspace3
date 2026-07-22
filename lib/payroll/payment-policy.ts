import { EMPLOYEE_PAYMENT_SOURCE_TYPE } from '@/lib/constants/payroll';

/** Deductions are born approved through their dedicated, capped approval RPC. */
export function canApproveEmployeePaymentDirectly(sourceType: string): boolean {
  return sourceType !== EMPLOYEE_PAYMENT_SOURCE_TYPE.DEDUCTION;
}

/** Deductions become paid only when their linked payroll run is paid. */
export function canPayEmployeePaymentDirectly(sourceType: string): boolean {
  return sourceType !== EMPLOYEE_PAYMENT_SOURCE_TYPE.DEDUCTION;
}
