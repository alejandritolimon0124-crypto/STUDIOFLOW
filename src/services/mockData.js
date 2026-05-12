export const artistProfile = {
  name: 'Valeria Moon Studio',
  role: 'Artista principal',
  location: 'Polanco, CDMX',
  rating: '4.9',
  plan: 'Studio Pro',
  occupancy: '82%',
}

export const artistAppointments = [
  { time: '09:30', end: '10:15', client: 'Mariana L.', service: 'Laminado de ceja', duration: '45 min', status: 'Confirmada', room: 'Suite Rose', type: 'appointment' },
  { time: '11:00', end: '12:10', client: 'Camila R.', service: 'Lash lifting', duration: '70 min', status: 'Por llegar', room: 'Suite Nude', type: 'appointment' },
  { time: '14:00', end: '15:00', client: 'Descanso', service: 'Bloque no disponible', duration: '60 min', status: 'Descanso', room: 'Agenda', type: 'break' },
  { time: '16:00', end: '17:30', client: 'Ana G.', service: 'Makeup social', duration: '90 min', status: 'Anticipo', room: 'Makeup bar', type: 'appointment' },
]

export const artistServices = [
  { name: 'Lash lifting', category: 'Colocación de Pestañas', price: 680, duration: '70 min', bookings: 18, demand: 'Alta', status: 'Activo' },
  { name: 'Brow design', category: 'Microblading', price: 420, duration: '45 min', bookings: 24, demand: 'Top', status: 'Activo' },
  { name: 'Soft glam makeup', category: 'Maquillaje', price: 1250, duration: '90 min', bookings: 11, demand: 'Media', status: 'Suspendido' },
]

export const serviceCatalog = {
  'Colocación de Uñas': [
    'Uñas acrílicas',
    'Uñas en gel',
    'Uñas postizas',
    'Ombré nails',
    'Diseño personalizado',
    'Nail art',
    'Uñas decoradas',
    'Extensión de uñas',
    'Uñas 3D',
  ],
  'Colocación de Pestañas': [
    'Pestañas volumen ruso',
    'Pestañas volumen clásico',
    'Pestañas volumen híbrido',
    'Pestañas de seda',
    'Pestañas de visón',
    'Refuerzos de pestañas',
    'Desmaquillante de pestañas',
  ],
  Maquillaje: [
    'Maquillaje de novia',
    'Maquillaje casual',
    'Maquillaje de quinceaños',
    'Maquillaje de evento social',
    'Maquillaje de fiesta',
    'Maquillaje de graduación',
    'Maquillaje artístico',
    'Maquillaje fantasía',
    'Maquillaje smoke eyes',
    'Maquillaje natural',
    'Maquillaje glam',
    'Maquillaje corporativo',
    'Maquillaje de sesión fotográfica',
  ],
  Manicure: [
    'Manicure clásico',
    'Manicure francés',
    'Manicure gel',
    'Manicure spa',
    'Manicure con diseño',
    'Manicure semipermanente',
    'Manicure para eventos',
    'Manicure reparador',
    'Manicure con piedras',
  ],
  Pedicure: [
    'Pedicure clásico',
    'Pedicure francés',
    'Pedicure gel',
    'Pedicure spa',
    'Pedicure con diseño',
    'Pedicure semipermanente',
    'Pedicure para eventos',
    'Pedicure reparador',
    'Pedicure con piedras',
    'Pedicure terapéutico',
  ],
  Microblading: [
    'Microblading cejas',
    'Microblading con sombreado',
    'Microblading de pelo a pelo',
    'Diseño de cejas',
    'Corrección de cejas',
    'Micropigmentación labios',
    'Micropigmentación delineado',
  ],
  Faciales: [
    'Limpieza facial profunda',
    'Facial con ácido glicólico',
    'Facial con ácido salicílico',
    'Facial hidratante',
    'Facial antienvejecimiento',
    'Facial antiacné',
    'Facial descongestionante',
    'Facial con mascarilla de colágeno',
    'Facial con retinol',
    'Facial vitamínico',
    'Peeling facial',
    'Facial luminoso',
    'Facial para pieles sensibles',
    'Facial oxigenante',
  ],
  Depilado: [
    'Depilación con cera',
    'Depilación con hilo',
    'Depilación láser',
    'Depilación de cejas',
    'Depilación de bigote',
    'Depilación de axilas',
    'Depilación de piernas',
    'Depilación de brazos',
    'Depilación de espalda',
    'Depilación de zona íntima',
    'Depilación facial',
    'Depilación con azúcar',
  ],
}

export const weeklySchedule = [
  { day: 'Lunes', active: true, start: '10:00', end: '19:00', breakStart: '14:00', breakEnd: '15:00' },
  { day: 'Martes', active: true, start: '10:00', end: '18:00', breakStart: '14:30', breakEnd: '15:00' },
  { day: 'Miércoles', active: true, start: '11:00', end: '19:00', breakStart: '15:00', breakEnd: '15:30' },
  { day: 'Jueves', active: true, start: '10:00', end: '18:00', breakStart: '14:00', breakEnd: '15:00' },
  { day: 'Viernes', active: true, start: '10:00', end: '17:00', breakStart: '13:30', breakEnd: '14:00' },
  { day: 'Sábado', active: false, start: 'Libre', end: 'Libre', breakStart: '-', breakEnd: '-' },
  { day: 'Domingo', active: false, start: 'Libre', end: 'Libre', breakStart: '-', breakEnd: '-' },
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
  { name: 'Valeria Moon Studio', city: 'CDMX', plan: 'Studio Pro', status: 'Activo', revenue: '$84K', owner: 'Valeria Moon' },
  { name: 'Aura Nails', city: 'Guadalajara', plan: 'Premium', status: 'Inactivo', revenue: '$46K', owner: 'Renata Sol' },
  { name: 'Nude Beauty Lab', city: 'Monterrey', plan: 'Studio Pro', status: 'Activo', revenue: '$63K', owner: 'Sofia Lab' },
]

export const managedClients = [
  { name: 'Mariana Lopez', appointments: 12, status: 'Activo', segment: 'VIP', spend: '$8.4K' },
  { name: 'Camila Ruiz', appointments: 7, status: 'Activo', segment: 'Frecuente', spend: '$4.2K' },
  { name: 'Ana Garza', appointments: 4, status: 'Inactivo', segment: 'Nueva', spend: '$1.8K' },
]

export const systemStatus = [
  { label: 'API', status: 'Preparada', tone: 'success', detail: 'Servicios listos para conectar' },
  { label: 'Supabase', status: 'Pendiente', tone: 'neutral', detail: 'Modulo reservado' },
  { label: 'Pagos', status: 'Pendiente', tone: 'neutral', detail: 'Checkout futuro' },
  { label: 'Autenticacion', status: 'Pendiente', tone: 'neutral', detail: 'Contexto creado' },
]
