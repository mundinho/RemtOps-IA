/** Countries offered in the contact forms. Mozambique first, then the region, then partners. */
export interface Country {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  dial: string; // international prefix, e.g. "+258"
}

export const DEFAULT_COUNTRY = 'MZ';

export const COUNTRIES: Country[] = [
  { code: 'MZ', name: 'Mozambique', dial: '+258' },
  // Neighbours / SADC
  { code: 'ZA', name: 'South Africa', dial: '+27' },
  { code: 'SZ', name: 'Eswatini', dial: '+268' },
  { code: 'ZW', name: 'Zimbabwe', dial: '+263' },
  { code: 'MW', name: 'Malawi', dial: '+265' },
  { code: 'ZM', name: 'Zambia', dial: '+260' },
  { code: 'TZ', name: 'Tanzania', dial: '+255' },
  { code: 'BW', name: 'Botswana', dial: '+267' },
  { code: 'NA', name: 'Namibia', dial: '+264' },
  { code: 'MG', name: 'Madagascar', dial: '+261' },
  // Portuguese-speaking
  { code: 'AO', name: 'Angola', dial: '+244' },
  { code: 'PT', name: 'Portugal', dial: '+351' },
  { code: 'BR', name: 'Brazil', dial: '+55' },
  { code: 'CV', name: 'Cape Verde', dial: '+238' },
  // Frequent business partners
  { code: 'KE', name: 'Kenya', dial: '+254' },
  { code: 'CN', name: 'China', dial: '+86' },
  { code: 'IN', name: 'India', dial: '+91' },
  { code: 'AE', name: 'United Arab Emirates', dial: '+971' },
  { code: 'GB', name: 'United Kingdom', dial: '+44' },
  { code: 'US', name: 'United States', dial: '+1' },
  { code: 'FR', name: 'France', dial: '+33' },
  { code: 'IT', name: 'Italy', dial: '+39' },
];

export const countryByCode = (code: string | null | undefined) => COUNTRIES.find((c) => c.code === code);

export const countryLabel = (code: string | null | undefined) => {
  const c = countryByCode(code);
  return c ? c.name : (code ?? '—');
};

