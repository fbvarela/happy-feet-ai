Happy-feet app

I want to create a desktop app to manage a podiatry office in Galapagar, Madrid, Spain

It will be split in for main parts:

- Office services
- Client management
- Clinic history
- Accounting and tax management

CONSTRAINTS

- Security: This app is should comply with the european data protection law. Data should not leave the computer via internet. All data should be encrypted (including documents and images). There will be a single user with admin role.
- The app should be coded with electron or other self contain technology (no configuration by user, no server=)
- Storage: Data storage should be local. Use SQLite3 could be a good option. images and documents should be stored also locally.
- Style: This app is going to be used by a health professional, not clients or users. Prioritize functionality over all.
- The app should be in spanish language (no multilang)
- Office services

The user should be able to manage all treatments provided along with the prize (VAT included) .

- Client management

The user should be able to manage:

- clients personal info.
- client treatments and cost.
- client invoicing
- Clinic history

  - The user should be able to manage the clinic history of every patient with the treatments they received.
  - This data should be encrypted by the state of the art algorithm.
- Accounting and tax management

  - The user should be able to manage accounting of each client and treatments.
  - The user should be able to create invoices in a standard format (invoice number, concepts, taxes, total cost, subtotals...)
  - The user should be able to manage the VAT quaterly report
  - The user should be able to create reports (daily, weekly, ...)
  - The user should be able to create charts (daily, weekly, ...)
