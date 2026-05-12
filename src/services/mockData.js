export const artistProfile = {
  name: 'Valeria Moon Studio',
  role: 'Artista principal',
  location: 'Polanco, CDMX',
  rating: '4.9',
  plan: 'Studio Pro',
  occupancy: '82%',
}

export const artistAppointments = [
  { time: '09:30', client: 'Mariana L.', service: 'Laminado de ceja', status: 'Confirmada', room: 'Suite Rose' },
  { time: '11:00', client: 'Camila R.', service: 'Lash lifting', status: 'Por llegar', room: 'Suite Nude' },
  { time: '13:30', client: 'Sofia P.', service: 'Diseno de unas', status: 'Confirmada', room: 'Mesa 2' },
  { time: '16:00', client: 'Ana G.', service: 'Makeup social', status: 'Anticipo', room: 'Makeup bar' },
]

export const artistServices = [
  { name: 'Lash lifting', price: 680, duration: '70 min', bookings: 18, demand: 'Alta' },
  { name: 'Brow design', price: 420, duration: '45 min', bookings: 24, demand: 'Top' },
  { name: 'Soft glam makeup', price: 1250, duration: '90 min', bookings: 11, demand: 'Media' },
]

export const recurringClients = [
  { name: 'Mariana L.', visits: 12, next: 'Mie 15', value: '$8.4K' },
  { name: 'Camila R.', visits: 9, next: 'Vie 17', value: '$6.1K' },
  { name: 'Renata M.', visits: 7, next: 'Lun 20', value: '$4.8K' },
]

export const clientAppointments = [
  { artist: 'Valeria Moon', service: 'Lash lifting', date: 'Miercoles 15', time: '11:00', address: 'Polanco' },
  { artist: 'Nude Beauty Lab', service: 'Facial glow', date: 'Sabado 18', time: '13:30', address: 'Roma Norte' },
]

export const favoriteArtists = [
  { name: 'Valeria Moon', specialty: 'Lashes & brows', rating: '4.9', distance: '1.8 km', nextSlot: 'Hoy 17:30' },
  { name: 'Nude Beauty Lab', specialty: 'Skin care', rating: '4.8', distance: '3.2 km', nextSlot: 'Manana 12:00' },
  { name: 'Aura Nails', specialty: 'Nail art premium', rating: '4.9', distance: '4.1 km', nextSlot: 'Vie 10:00' },
]

export const clientHistory = [
  { service: 'Brow design', artist: 'Valeria Moon', date: 'Abr 28', amount: '$420' },
  { service: 'Facial glow', artist: 'Nude Beauty Lab', date: 'Abr 12', amount: '$950' },
  { service: 'Nail art premium', artist: 'Aura Nails', date: 'Mar 30', amount: '$720' },
]

export const adminMetrics = [
  { label: 'Reservas del mes', value: '2,184', trend: '+18%' },
  { label: 'Ingresos procesados', value: '$1.28M', trend: '+12%' },
  { label: 'Artistas activas', value: '348', trend: '+31' },
  { label: 'Clientes registradas', value: '12.6K', trend: '+9%' },
]

export const managedArtists = [
  { name: 'Valeria Moon Studio', city: 'CDMX', plan: 'Studio Pro', status: 'Activo', revenue: '$84K' },
  { name: 'Aura Nails', city: 'Guadalajara', plan: 'Premium', status: 'Revision', revenue: '$46K' },
  { name: 'Nude Beauty Lab', city: 'Monterrey', plan: 'Studio Pro', status: 'Activo', revenue: '$63K' },
]

export const managedClients = [
  { name: 'Mariana Lopez', appointments: 12, status: 'VIP', spend: '$8.4K' },
  { name: 'Camila Ruiz', appointments: 7, status: 'Activa', spend: '$4.2K' },
  { name: 'Ana Garza', appointments: 4, status: 'Nueva', spend: '$1.8K' },
]

export const systemStatus = [
  { label: 'API', status: 'Preparada', tone: 'success', detail: 'Servicios listos para conectar' },
  { label: 'Supabase', status: 'Pendiente', tone: 'neutral', detail: 'Modulo reservado' },
  { label: 'Pagos', status: 'Pendiente', tone: 'neutral', detail: 'Checkout futuro' },
  { label: 'Autenticacion', status: 'Pendiente', tone: 'neutral', detail: 'Contexto creado' },
]
