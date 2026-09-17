declare module '*.module.css' {
  const classes: { dialog: string; body: string } & Record<string, string>
  export default classes
}

declare module '*.css'
