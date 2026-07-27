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

    // Configuración por clic en los elementos de la barra lateral
    const dragItems = document.querySelectorAll('.drag-item');
    
    dragItems.forEach(item => {
        item.addEventListener('click', () => {
            const type = item.getAttribute('data-type');
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

        const content = document.createElement('div');
        content.setAttribute('contenteditable', 'true');

        // Si es ingredientes o preparación, agregamos el botón de Auto-formatear texto
        if (type === 'ingredients' || type === 'preparation') {
            const formatBtn = document.createElement('button');
            formatBtn.className = 'format-btn';
            formatBtn.innerHTML = '✨ Limpiar y Formatear';
            formatBtn.title = 'Limpia símbolos raros y convierte el texto pegado en lista';
            formatBtn.onclick = () => autoFormatBlock(content, type);
            wrapper.appendChild(formatBtn);
        }

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

    // Función inteligente mejorada para separar ingredientes pegados de corrido
    function autoFormatBlock(contentElement, type) {
        let rawText = contentElement.innerText || contentElement.textContent;

        // 1. Limpiar caracteres corruptos de casillas de PDF
        rawText = rawText.replace(/[\u25A0-\u25FF\uFFFD\u2610\u2611\u2612]/g, ''); 
        rawText = rawText.replace(/^[•\-\*]\s*/gm, '').trim();

        let lines = rawText.split(/\n+/).map(l => l.trim()).filter(l => l.length > 0);

        // Si el usuario pegó todo en una sola línea continua, aplicamos separación inteligente por patrones
        if (lines.length === 1 && type === 'ingredients') {
            let singleText = lines[0];
            
            // Expresión para separar cuando un número va precedido por otro ingrediente (ej: "feta 6 huevos", "wrap) 1 pizca", "sal 1 pizca", "pimienta 2", "trigo hojas", "opcional) Un")
            // Patrón robusto para ingredientes comunes en español
            const matches = singleText.match(/(?:\d+[\s\w\(\)]*?(?=\s+\d+\s+(?:gr|huez|huevos|cucharada|pizca|tortillas|hojas|un|chorrito)|\s+(?:hojas|un|chorrito)\b|$))/gi);
            
            if (matches && matches.length > 1) {
                lines = matches.map(m => m.trim()).filter(m => m.length > 0);
            } else {
                // Fallot alternativo: separar buscando números clave seguidos de unidades
                let splitPattern = /(?=\d+\s*(?:gr|g|kg|ml|l|cucharada|cucharadita|taza|pizca|huevos|tortilla|hojas|chorrito)|Un\s+chorrito|Hojas\s+de)/gi;
                let parts = singleText.split(splitPattern).map(p => p.trim()).filter(p => p.length > 0);
                if (parts.length > 1) {
                    lines = parts;
                }
            }
        }

        const tag = (type === 'ingredients') ? 'ul' : 'ol';
        let htmlOutput = `<${tag}>`;
        lines.forEach(line => {
            let cleanLine = line.replace(/^\d+[\.\)]\s*/, '').trim();
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
