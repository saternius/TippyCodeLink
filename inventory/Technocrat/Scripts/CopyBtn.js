log("copybtn", "starting")
let navControls = document.querySelector(".nav-controls")
let copyBtn = document.createElement("button")
copyBtn.classList.add("nav-control-btn")
copyBtn.innerHTML = "<span>✂️</span>"
navControls.appendChild(copyBtn)

// prevent the button from stealing focus
copyBtn.type = "button"
copyBtn.addEventListener("mousedown", (e)=>{
	e.preventDefault()
})

// copy selected text to clipboard
copyBtn.addEventListener("click", async ()=>{
	try{
		const selectedText = window.getSelection().toString()
		if(!selectedText){
			showNotification("No text selected")
			return
		}
		await navigator.clipboard.writeText(selectedText)
		showNotification("Copied to clipboard")
	}catch(err){
		console.error("Clipboard write failed", err)
		showNotification("Unable to copy to clipboard")
	}
})
