document.addEventListener('DOMContentLoaded', () => {
    const bgSelect = document.getElementById('bgSelect');
    const recipeSheet = document.getElementById('recipeSheet');
    const dropZone = document.getElementById('dropZone');
    const btnPdf = document.getElementById('btnPdf');
    const textColor = document.getElementById('textColor');
    const fontSizeSelect = document.getElementById('fontSizeSelect');

    // Fondo inicial automático
    if (bgSelect.value) {
        recipeSheet.style.backgroundImage = `url('${bgSelect.value}')`;
    }

    // Cambiar fondo
    bgSelect.addEventListener('change', (e) => {
        const selectedBg = e.target.value;
        if (selectedBg) {
            recipeSheet.style.backgroundImage = `url('${selectedBg}')`;
        } else {
            recipeSheet.style.backgroundImage = 'none';
        }
    });

    function addBlockToSheet(type) {
        const placeholder = dropZone.querySelector('.placeholder-msg');
        if (placeholder) {
            placeholder.remove();
        }

        const block = createBlock(type);
        dropZone.appendChild(block);
    }

    // Método por Clic en la barra lateral
    const actionButtons = document.querySelectorAll('.action-btn');
    actionButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.getAttribute('data-type');
            addBlockToSheet(type);
        });
    });

    function createBlock(type) {
        const wrapper = document.createElement('div');
        wrapper.className = 'recipe-block';

        // Botón para eliminar bloque
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.title = 'Eliminar elemento';
        deleteBtn.onclick = () => wrapper.remove();
        wrapper.appendChild(deleteBtn);

        // Si es ingredientes o preparación, agregamos un botón de "Auto-formatear texto pegado"
        if (type === 'ingredients' || type === 'preparation') {
            const formatBtn = document.createElement('button');
            formatBtn.className = 'format-btn';
            formatBtn.innerHTML = '✨ Limpiar y Formatear';
            formatBtn.title = 'Limpia símbolos raros y convierte el texto pegado en lista';
            formatBtn.onclick = () => autoFormatBlock(content, type);
            wrapper.appendChild(formatBtn);
        }

        const content = document.createElement('div');
        content.setAttribute('contenteditable', 'true');

        switch (type) {
            case 'title':
                content.className = 'block-title';
                content.innerText = 'Título de la Receta';
                break;
            case 'time':
                content.className = 'block-meta';
                content.innerText = '⏱️ Tiempo: 45 min';
                break;
            case 'complexity':
                content.className = 'block-meta';
                content.innerText = '⭐ Complejidad: Media';
                break;
            case 'portions':
                content.className = 'block-meta';
                content.innerText = '🍽️ Porciones: 4';
                break;
            case 'ingredients':
                const ingTitle = document.createElement('div');
                ingTitle.className = 'block-section-title';
                ingTitle.setAttribute('contenteditable', 'true');
                ingTitle.innerText = 'Ingredientes';
                wrapper.appendChild(ingTitle);

                content.className = 'block-text';
                content.innerHTML = '<ul><li>100 gr de queso feta</li><li>6 huevos</li><li>1 cucharada de aceite de oliva</li></ul>';
                break;
            case 'preparation':
                const prepTitle = document.createElement('div');
                prepTitle.className = 'block-section-title';
                prepTitle.setAttribute('contenteditable', 'true');
                prepTitle.innerText = 'Preparación';
                wrapper.appendChild(prepTitle);

                content.className = 'block-text';
                content.innerHTML = '<ol><li>Paso número uno...</li><li>Paso número dos...</li></ol>';
                break;
            default:
                content.className = 'block-text';
                content.innerText = 'Escribe tu texto aquí...';
                break;
        }

        wrapper.appendChild(content);
        return wrapper;
    }

    // Función inteligente para limpiar caracteres extraños de PDFs y estructurar en lista
    function autoFormatBlock(contentElement, type) {
        let rawText = contentElement.innerText || contentElement.textContent;

        // 1. Limpiar caracteres corruptos típicos de casillas de PDF (cuadros, símbolos extraños)
        rawText = rawText.replace(/[\u25A0-\u25FF\uFFFD\u2610\u2611\u2612]/g, ''); // Remueve casillas y caracteres inválidos
        
        // 2. Limpiar espacios múltiples o viñetas sueltas al inicio
        rawText = rawText.replace(/^[•\-\*]\s*/gm, '');

        // 3. Separar por líneas o intentar detectar elementos si se pegó todo seguido
        let lines = rawText.split(/\n+/).map(l => l.trim()).filter(l => l.length > 0);

        // Si el usuario pegó todo en una sola línea corrida (muy común al copiar de Adobe Reader)
        if (lines.length === 1 && lines[0].length > 50) {
            // Intentamos detectar patrones numéricos o de ingredientes comunes para separar
            // O simplemente dejamos que el usuario lo tenga limpio en párrafos
            lines = [lines[0]]; 
        }

        // Construir la lista HTML limpia
        const tag = (type === 'ingredients') ? 'ul' : 'ol';
        let htmlOutput = `<${tag}>`;
        lines.forEach(line => {
            // Limpiamos basura extra residual
            let cleanLine = line.replace(/^\d+[\.\)]\s*/, ''); // quita numeraciones viejas si las hubiera para regenerarlas ordenadas
            if (cleanLine) {
                htmlOutput += `<li>${cleanLine}</li>`;
            }
        });
        htmlOutput += `</${tag}>`;

        contentElement.innerHTML = htmlOutput;
    }

    // Comandos de formato de texto
    document.querySelectorAll('.tools-row button[data-command]').forEach(button => {
        button.addEventListener('click', () => {
            const command = button.getAttribute('data-command');
            document.execCommand(command, false, null);
        });
    });

    textColor.addEventListener('input', (e) => {
        document.execCommand('foreColor', false, e.target.value);
    });

    fontSizeSelect.addEventListener('change', (e) => {
        document.execCommand('fontSize', false, e.target.value);
    });

    btnPdf.addEventListener('click', () => {
        window.print();
    });
});
