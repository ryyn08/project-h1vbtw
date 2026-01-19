export const config = {
    bot: {
        name: 'Premium NextBoJst',
        version: '3.0.0'
    },

    mode: {  
        default: 'public',  // Ubah ke 'self' jika ingin bot hanya merespon owner
        allowed: ['public', 'self']  
    },  

    developer: {  
        name: 'Fyxzpedia',  
        telegram: 't.me/Fyxzpedia'  
    },  

    backup: {  
        exclude: [  
            'node_modules', 
            '.npm', 
            'sessions', 
            'package-lock.json', 
            'yarn.lock', 
            'backup.zip', 
            '.git', 
            'cache'  
        ]  
    },  

    push: {  
        delay: 3000  
    },  

    jpm: {  
        delay: 3000  
    },  

    payment: {  
        qris: 'https://files.catbox.moe/5he36z.jpg',  
        dana: '083126046403',  
        gopay: '083193211556'  
    },

    /**
     * PTERODACTYL CONFIGURATION
     * Pastikan URL host diawali dengan https:// dan tanpa garis miring (/) di akhir.
     */
    pterodactyl: {
        host: 'https://vvip.fyxzpediadomainpanel.my.id', 
        plta: 'ptla_NWfxNKzjJQD5tTgTGuITmoh01OkQnX7Trq0KhNtCktK', // API Key Application (Full Permission)
        ptlc: 'ptlc_cryFOSlgZ9Uc2XUkNdRUcZ3oXWeBamIYl0QBQdAQOYZ', // API Key Client
        
        // Default Server Settings
        location: '1',  // ID lokasi server (biasanya 1)
        nest: '5',      // ID Nest (biasanya 5 untuk NodeJS)
        egg: '15'       // ID Egg (cek di panel Anda untuk NodeJS egg ID)
    }
};
