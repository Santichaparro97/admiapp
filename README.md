# Admin · De La Ostia Perfumes

Panel de administración con Supabase + web pública en tiempo real.

## Stack

- **Supabase** (DB Postgres + Auth + API + Storage) — backend gratis
- **HTML / CSS / JS plano** — sin frameworks, mismo enfoque que la web pública
- **Vercel** — hosting estático del admin
- **WhatsApp** — sigue como canal de pedidos, pero ahora cada pedido queda guardado en la DB

---

## SETUP (60 min total, una sola vez)

### 1. Crear cuenta y proyecto en Supabase (5 min)

1. Andá a https://supabase.com/dashboard → **Sign up** con GitHub o email
2. Click en **New Project**
3. Datos:
   - Name: `delaostia-perfumes`
   - Database password: **GUARDÁ ESTA CONTRASEÑA** (la usás si querés acceder con pgAdmin o similar). No la necesitás más después
   - Region: `South America (São Paulo)` (más cerca de Argentina)
4. Click en **Create new project**. Espera 1-2 minutos.

### 2. Correr el schema SQL (3 min)

1. En el dashboard de tu proyecto, sidebar izquierdo → **SQL Editor**
2. Click en **New query**
3. Abrí el archivo `schema.sql` de esta carpeta, copiá TODO el contenido
4. Pegá en el editor y click en **Run** (o Ctrl+Enter)
5. Deberías ver: `Success. No rows returned.` Si hay errores, fijate y avisame.

Ahora tu DB tiene:
- Tabla `products` (con índices y RLS)
- Tabla `orders` (con auto-numeración tipo ORD-20260109-0001)
- Tabla `settings` (config general)
- Vista `admin_stats` (estadísticas del dashboard)

### 3. Crear el usuario admin (2 min)

1. Sidebar izquierdo → **Authentication** → **Users**
2. Click en **Add user** → **Create new user**
3. Datos:
   - Email: tu email personal (lo vas a usar para entrar al admin)
   - Password: una contraseña fuerte (8+ chars)
   - **Auto Confirm User**: ✅ activado
4. Click en **Create user**

### 4. Obtener tus credenciales (1 min)

1. Sidebar izquierdo → **Settings** (⚙️) → **API**
2. Copiá:
   - **Project URL** (algo como `https://abcdefgh.supabase.co`)
   - **anon public** key (un string largo)

### 5. Configurar el admin (1 min)

Editá el archivo `config.js`:

```js
window.SUPABASE_CONFIG = {
  url: 'https://abcdefgh.supabase.co',     // ← pegá acá tu Project URL
  anonKey: 'eyJhbGciOiJIUzI1NiIsI...',     // ← pegá acá tu anon key
};
```

### 6. Migrar los 1444 productos del data.json actual (5 min)

1. Abrí `migrate.html` en tu browser (o subila a Vercel primero — ver paso 8)
2. Subí el archivo `perfumescyc-clone/data/data.json` de la web pública
3. Hacé login con el admin que creaste en el paso 3
4. Click en **Iniciar migración**
5. Espera ~30 segundos. Al final dice "✓ Completado".

Ahora tu DB tiene los 1444 productos.

### 7. Conectar la web pública a Supabase (2 min)

En tu proyecto `perfumescyc-clone` (la web pública), editá:
`perfumescyc-clone/data/supabase-config.js`

```js
window.SUPABASE_CONFIG = {
  url: 'https://abcdefgh.supabase.co',     // ← mismo URL del admin
  anonKey: 'eyJhbGciOiJIUzI1NiIsI...',     // ← mismo anon key del admin
};
```

Commit + push a GitHub. Vercel redeploya. **Ahora la web pública lee los productos en VIVO desde la DB**.

### 8. Deploy del admin en Vercel (10 min)

1. Crear repo en GitHub para el admin:
   ```bash
   cd C:\Users\usuario\Contacts\perfumescyc-admin
   git init
   git add .
   git commit -m "Admin panel inicial"
   ```
2. Crear un repo NUEVO en https://github.com/new (ej: `webnahuel-admin`)
3. Push:
   ```bash
   git remote add origin https://github.com/Santichaparro97/webnahuel-admin.git
   git branch -M main
   git push -u origin main
   ```
4. En Vercel: **New Project** → importá el repo
5. Framework: **Other** (es estático)
6. Deploy. Te da una URL tipo `https://webnahuel-admin.vercel.app`

**Acceso al admin:**
- URL: `https://webnahuel-admin.vercel.app`
- Email + password: los que creaste en paso 3

---

## URLs del proyecto

| Cosa | URL |
|---|---|
| Web pública | https://webnahuel-XXXXXX.vercel.app |
| Admin | https://webnahuel-admin-XXXXXX.vercel.app |
| Supabase dashboard | https://supabase.com/dashboard |
| Migración (correr 1 vez) | `admin-url/migrate.html` |

---

## Qué podés hacer desde el admin

### Dashboard
- Productos activos, sin stock
- Pedidos pendientes, de la semana, ingresos del mes
- Últimos 5 pedidos

### Productos
- Buscar por nombre
- Filtrar por categoría
- Crear/editar/eliminar
- Toggle activo/inactivo (oculta en la web pública sin borrar)
- Stock, precio, original_price (precio tachado), destacado, descripción, imágenes

### Pedidos
- Ver lista completa con filtro por estado
- Detalle de cada pedido (cliente, items, total, dirección)
- Cambiar estado: pendiente → en_proceso → enviado → entregado (o cancelado)

### Configuración
- Nombre de la tienda, tagline, highlight pill
- Teléfono WhatsApp, Instagram
- Mensaje prearmado del CTA mayorista
- Todo se refleja en la web pública inmediatamente

---

## Cambios en tiempo real

- Editás un precio en el admin → la web pública lo muestra al refrescarse
- Un cliente hace checkout en la web → el pedido aparece en el admin instantáneamente
- Cambiás el stock → desaparece de la web

No hay que rebuildear ni reploy. Es vivo.

---

## Seguridad

- El `anon key` es público y solo permite operaciones definidas en RLS:
  - **LEER** productos activos
  - **CREAR** pedidos
  - **LEER** settings
- Cualquier cosa que cambia datos (admin) requiere login con email + password
- Las contraseñas de admin se manejan en Supabase Auth (no las vemos)
- Para agregar más admins, vas a Authentication → Users → Add user

---

## Troubleshooting

**"Falta configurar Supabase"**  
→ Editá `config.js` y pegá URL + anon key.

**Login falla con "Invalid login credentials"**  
→ El email/password está mal, o el usuario no existe. Andá a Authentication → Users en Supabase.

**Migración da errores**  
→ Mirá la consola del browser (F12). Si dice "relation 'products' does not exist", correr el `schema.sql` primero.

**La web pública sigue mostrando productos viejos después de editar**  
→ Cache del browser. Ctrl+F5. Si persiste, revisar que `data/supabase-config.js` tenga las credenciales bien.

**Pedidos no aparecen en el admin**  
→ Verificar que `data/supabase-config.js` de la web pública tenga las credenciales. Abrir la consola al hacer checkout y ver si hay errores.
