function Button({ children, variant = 'primary', size = 'md', className = '', ...props }) {
  return (
    <button className={`button button-${variant} button-${size} ${className}`} type="button" {...props}>
      {children}
    </button>
  )
}

export default Button
