export function detectInactiveClients(clients = []) {
  return clients.filter((client) => client.daysInactive >= 30)
}

export function createReactivationSummary(clients = []) {
  const inactiveClients = detectInactiveClients(clients)

  return {
    count: inactiveClients.length,
    clients: inactiveClients,
  }
}
