import {
  CompanyId,
  ViewingScope,
  PARENT_ORGANIZATION_ID,
  UserProfile,
  RequestRecord,
} from '../types/index';

/**
  * Pure authorization utility for multi-company access and Group View separation.
  * Separates Viewing Scope ('PEG' vs subsidiary) from User Permission Authorization.
  */

/**
  * Checks if a user is authorized to access data for a specific subsidiary company.
  */
export function canUserAccessCompany(user: UserProfile, companyId: CompanyId): boolean {
  if (!user) return false;
  // Group Admins, Directors, and General Managers have cross-company group authorization
  if (user.isGroupAdmin || user.role === 'Director' || user.role === 'General Manager') {
    return true;
  }
  // Primary company check
  if (user.companyId === companyId) {
    return true;
  }
  // Explicit multi-company allowed list check
  if (user.allowedCompanyIds && user.allowedCompanyIds.includes(companyId)) {
    return true;
  }
  return false;
}

/**
  * Filters request records based on viewing scope and user permissions.
  * - Viewing Scope 'PEG': Aggregates requests across all authorized subsidiaries.
  * - Viewing Scope 'PEW' / 'ICCL' / 'FSG': Restricts to that specific legal entity if authorized.
  */
export function filterRequestsByScopeAndUser(
  requests: RequestRecord[],
  scope: ViewingScope,
  user: UserProfile
): RequestRecord[] {
  if (!requests || !user) return [];

  if (scope === PARENT_ORGANIZATION_ID) {
    // Group View: Return all requests belonging to subsidiaries the user is authorized to view
    return requests.filter((req) => canUserAccessCompany(user, req.companyId));
  }

  // Individual Company View: Strictly filter by specified company AND verify user authorization
  return requests.filter(
    (req) => req.companyId === scope && canUserAccessCompany(user, req.companyId)
  );
}

/**
  * Validates originating company selection when creating a request.
  * Requests created while in Group View ('PEG') MUST specify an originating subsidiary company.
  */
export function validateOriginatingCompany(
  scope: ViewingScope,
  targetCompanyId?: CompanyId,
  userCompanyId?: CompanyId
): { companyId: CompanyId | null; isValid: boolean; error?: string } {
  if (scope === PARENT_ORGANIZATION_ID) {
    if (!targetCompanyId) {
      return {
        companyId: null,
        isValid: false,
        error: 'When creating a request in Group View, an originating subsidiary company (PEW, ICCL, FSG) must be explicitly selected.',
      };
    }
    return {
      companyId: targetCompanyId,
      isValid: true,
    };
  }

  const resolvedCompanyId: string | undefined = targetCompanyId || scope || userCompanyId;
  if (!resolvedCompanyId || resolvedCompanyId === (PARENT_ORGANIZATION_ID as string)) {
    return {
      companyId: null,
      isValid: false,
      error: 'Invalid subsidiary company selected.',
    };
  }

  return {
    companyId: resolvedCompanyId as CompanyId,
    isValid: true,
  };
}
