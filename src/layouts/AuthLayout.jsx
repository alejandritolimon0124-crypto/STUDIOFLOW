function AuthLayout({ children }) {
  return (
    <main
      className="auth-shell"
      style={{
        alignItems: 'center',
        display: 'flex',
        justifyContent: 'center',
        minHeight: '100svh',
        padding: '18px',
      }}
    >
      <section
        style={{
          maxWidth: '430px',
          width: '100%',
        }}
      >
        {children}
      </section>
    </main>
  )
}

export default AuthLayout
