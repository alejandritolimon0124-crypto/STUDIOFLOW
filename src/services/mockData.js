export const artistProfile = {
  name: 'Valeria Moon Studio',
  role: 'Artista principal',
  location: 'Polanco, CDMX',
  rating: '4.9',
}

export const artistAppointments = [
  { time: '09:30', client: 'Mariana L.', service: 'Laminado de ceja', status: 'Confirmada' },
  { time: '11:00', client: 'Camila R.', service: 'Lash lifting', status: 'Por llegar' },
  { time: '13:30', client: 'Sofia P.', service: 'Diseno de unas', status: 'Confirmada' },
  { time: '16:00', client: 'Ana G.', service: 'Makeup social', status: 'Anticipo' },
]

export const artistServices = [
  { name: 'Lash lifting', price: 680, duration: '70 min', bookings: 18 },
  { name: 'Brow design', price: 420, duration: '45 min', bookings: 24 },
  { name: 'Soft glam makeup', price: 1250, duration: '90 min', bookings: 11 },
]

export const recurringClients = [
  { name: 'Mariana L.', visits: 12, next: 'Mie 15' },
  { name: 'Camila R.', visits: 9, next: 'Vie 17' },
  { name: 'Renata M.', visits: 7, next: 'Lun 20' },
]

export const clientAppointments = [
  { artist: 'Valeria Moon', service: 'Lash lifting', date: 'Miercoles 15', time: '11:00' },
  { artist: 'Nude Beauty Lab', service: 'Facial glow', date: 'Sabado 18', time: '13:30' },
]

export const favoriteArtists = [
  { name: 'Valeria Moon', specialty: 'Lashes & brows', rating: '4.9', distance: '1.8 km' },
  { name: 'Nude Beauty Lab', specialty: 'Skin care', rating: '4.8', distance: '3.2 km' },
  { name: 'Aura Nails', specialty: 'Nail art premium', rating: '4.9', distance: '4.1 km' },
]

export const adminMetrics = [
  { label: 'Reservas del mes', value: '2,184', trend: '+18%' },
  { label: 'Ingresos procesados', value: '$1.28M', trend: '+12%' },
  { label: 'Artistas activas', value: '348', trend: '+31' },
  { label: 'Clientes registradas', value: '12.6K', trend: '+9%' },
]

export const managedArtists = [
  { name: 'Valeria Moon Studio', city: 'CDMX', plan: 'Studio Pro', status: 'Activo' },
  { name: 'Aura Nails', city: 'Guadalajara', plan: 'Premium', status: 'Revision' },
  { name: 'Nude Beauty Lab', city: 'Monterrey', plan: 'Studio Pro', status: 'Activo' },
]

export const managedClients = [
  { name: 'Mariana Lopez', appointments: 12, status: 'VIP' },
  { name: 'Camila Ruiz', appointments: 7, status: 'Activa' },
  { name: 'Ana Garza', appointments: 4, status: 'Nueva' },
]
