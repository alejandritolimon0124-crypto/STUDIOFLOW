const mockClients = [
  { name: 'Mariana Lopez', daysInactive: 34 },
  { name: 'Camila Ruiz', daysInactive: 42 },
  { name: 'Renata Morales', daysInactive: 18 },
  { name: 'Ana Garza', daysInactive: 65 },
]

export function detectInactiveClients(clients = mockClients) {
  return clients.filter((client) => client.daysInactive >= 30)
}

export function createReactivationSummary(clients = mockClients) {
  const inactiveClients = detectInactiveClients(clients)

  return {
    count: inactiveClients.length,
    clients: inactiveClients,
  }
}
