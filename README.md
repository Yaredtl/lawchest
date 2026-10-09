# LawChest

Programa de escritorio para Windows que organiza los **clientes**, sus **archivos** y sus **gastos e ingresos**. Está pensado para un despacho de abogados y su diseño recuerda a Google Drive.

- No necesita servidor: los datos se guardan en el ordenador o en tu propia nube (OneDrive, Google Drive o Dropbox) si lo usas en varios ordenadores.
- Se instala con un único archivo `LawChest-Setup.exe`, como cualquier otro programa.
- Colores del despacho: granate `#6A1F2B` y ámbar `#F8A11B`. Fuentes: *Oranienbaum* para los títulos e *Inter* para los textos. Ambas van incluidas, así que no hace falta conexión.

## Funciones

| | |
|---|---|
| **Clientes** | Carpeta principal con todos los clientes. El nombre es libre y se pueden añadir datos opcionales (DNI, teléfono, email, dirección, nº de expediente… o cualquier dato propio). Buscador y vista en cuadrícula o lista. |
| **Zona de trabajo** | Cada cliente tiene su carpeta. Se le añaden archivos de cualquier tipo **arrastrándolos**, con **«Subir archivos»** o **pegándolos (Ctrl+V)**, incluidas capturas de pantalla. Admite subcarpetas ilimitadas, mover, renombrar y abrir en el Explorador. |
| **Gastos e ingresos** | Tabla con concepto, importe, tipo y fecha opcional. El **balance** (ingresos − gastos) está siempre visible. |
| **Resúmenes** | Por cliente, o mensual con todos los clientes (totales y detalle de movimientos). Se descargan en **PDF, Excel o CSV**. |
| **Papelera** | Lo borrado (clientes, carpetas y archivos) se guarda **30 días** y después se elimina solo. Se puede restaurar o vaciar cuando se quiera. |
| **Confirmaciones** | Toda acción de crear, editar o borrar pide confirmación. |
| **Copias de seguridad** | Un botón guarda todo en un `.zip`, por ejemplo en un USB, y otro lo restaura. |
| **Varios ordenadores** | Los datos pueden guardarse en OneDrive, Google Drive o Dropbox y se ven igual en todos los ordenadores. |
| **Actualizaciones** | Al abrir LawChest se avisa si hay una versión nueva, que se instala con un clic. |

## Dónde se guardan los datos

Por defecto, los datos van en `Documentos\LawChest\`, separados del programa, de modo que desinstalarlo o actualizarlo no los borra:

```
LawChest\
├── Clientes\                        ← una carpeta por cliente (con sus subcarpetas)
├── Papelera\                        ← lo borrado (se vacía solo a los 30 días)
├── lawchest.db                      ← base de datos (clientes, datos y cuentas)
└── Conflictos de sincronización\    ← solo si se editó a la vez en dos ordenadores
```

### Usar LawChest en varios ordenadores

1. En el primer ordenador, ve a **Ajustes → Dónde se guardan tus datos** y elige **OneDrive**, **Google Drive** o **Dropbox**. Los datos se copian a `<tu nube>\LawChest`.
2. En el segundo ordenador, inicia sesión en la misma nube, instala LawChest y, en la pantalla de bienvenida, elige esa nube. Aparecerá marcada como **«Datos encontrados»**.

Cómo funciona:
- Los archivos de los clientes los sincroniza directamente la nube.
- La base de datos nunca se abre dentro de la carpeta sincronizada, porque así se corrompe. Cada ordenador trabaja con una copia local en AppData.
- Tras cada cambio, LawChest guarda en `lawchest.db` una versión completa y la sustituye de golpe.
- Al abrir la app, al volver a la ventana y cada 15 segundos, LawChest comprueba si el otro ordenador ha guardado algo nuevo y, si es así, lo carga.
- Si se hacen cambios a la vez en los dos ordenadores, se queda la versión más reciente y la otra se guarda en `Conflictos de sincronización`.

## Actualizaciones automáticas

Al abrir LawChest, y cada 6 horas, el programa consulta las versiones publicadas en GitHub (Releases). Si hay una nueva, muestra un aviso con **«Actualizar ahora»**: la descarga, se cierra, se instala y vuelve a abrirse. Los datos no se tocan.

> **Requisito:** para que LawChest pueda consultar las versiones sin contraseña, las Releases deben ser públicas. Es decir, el repositorio tiene que ser público, o los instaladores deben publicarse en otro repositorio público. En el código no hay datos de clientes: esos datos solo están en cada ordenador y en su nube.

## Descargar el instalador

Cada vez que se suben cambios a GitHub, la acción **«Instalador de Windows»** genera el instalador:

1. Entra en la pestaña **Actions** del repositorio y abre la última ejecución en verde.
2. Al final de la página, en **Artifacts**, descarga **LawChest-Instalador-Windows**. Es un `.zip` que contiene `LawChest-Setup-x.y.z.exe`.
3. Ejecuta el `.exe` en el ordenador. Windows puede mostrar el aviso «Windows protegió su PC», porque el programa no está firmado digitalmente: pulsa **Más información → Ejecutar de todas formas**.

Cada vez que se actualiza la rama `main`, el instalador también se publica en **Releases** con la versión de `package.json` (por ejemplo, `v1.0.0`). Para sacar una versión nueva, sube el número de `version` en `package.json`.

## Desarrollo

Requisitos: Node.js 22 o superior.

```bash
npm install
npm run dev        # abre la app en modo desarrollo
npm run typecheck  # comprueba los tipos
npm run dist:win   # genera el instalador (en Windows)
```

Tecnologías: Electron, React, TypeScript, Tailwind CSS, SQLite (incluido en Electron, sin módulos nativos), pdfmake, ExcelJS, electron-builder (NSIS) y electron-updater.

Seguridad: aislamiento de contexto, *sandbox*, sin integración de Node en la interfaz, política de contenidos estricta y validación de rutas para no salir de la carpeta del cliente. La única conexión que hace la app es a GitHub, para buscar actualizaciones; la sincronización entre ordenadores la hace tu programa de nube.
