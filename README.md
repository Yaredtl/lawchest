# LawChest

Programa de escritorio para Windows que organiza los **clientes**, sus **archivos** y sus **gastos e ingresos**. Está pensado para un despacho de abogados y su diseño recuerda a Google Drive.

- Funciona **100 % sin internet**: los datos no salen nunca del ordenador.
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

## Dónde se guardan los datos

Los datos van en `Documentos\LawChest\`, separados del programa, de modo que desinstalarlo o actualizarlo no los borra:

```
Documentos\LawChest\
├── Clientes\              ← una carpeta por cliente (con sus subcarpetas)
├── Papelera\              ← lo borrado (se vacía solo a los 30 días)
└── lawchest.db            ← base de datos (clientes, datos y cuentas)
```

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

Tecnologías: Electron, React, TypeScript, Tailwind CSS, SQLite (incluido en Electron, sin módulos nativos), pdfmake, ExcelJS y electron-builder (NSIS).

Seguridad: aislamiento de contexto, *sandbox*, sin integración de Node en la interfaz, política de contenidos estricta, sin conexiones externas y con validación de rutas para no salir de la carpeta del cliente.
