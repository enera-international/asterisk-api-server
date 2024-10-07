import express, { Request, Response, NextFunction } from 'express'
import { body, validationResult } from 'express-validator'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { EneraAsteriskApiServer } from './api.js'

export const apiVersion = "2.0.0"

// Declare a custom property for user on Request object
declare global {
    namespace Express {
        interface Request {
            user?: string
        }
    }
}

export class Server {
    constructor(public eneraAsteriskApiServer: EneraAsteriskApiServer) {
        this.init()
    }
    async init() {
        const app = express()
        const port = Number(process.env.PORT || 3000)

        app.use(express.json())

        // Replace these with your actual secret and user database
        const secret = 'your-secret-key';
        const users: { username: string; passwordHash: string }[] = [
            {
                username: 'user',
                passwordHash: bcrypt.hashSync('password', 10)
            }
        ];

        // Middleware to validate JWT
        const authenticateJWT = (req: Request, res: Response, next: NextFunction) => {
            const token = req.header('Authorization')?.split(' ')[1]
            if (!token) return res.sendStatus(401)

            jwt.verify(token, secret, (err, user) => {
                if (err) return res.sendStatus(403)
                req.user = user as string
                next()
            });
        };

        // Register a new user
        app.post(
            '/register',
            body('username').isLength({ min: 3 }),
            body('password').isLength({ min: 5 }),
            (req: Request, res: Response) => {
                const errors = validationResult(req)
                if (!errors.isEmpty()) {
                    return res.status(400).json({ errors: errors.array() })
                }

                const { username, password } = req.body
                const saltRounds = 10

                bcrypt.hash(password, saltRounds, (err, passwordHash) => {
                    if (err) return res.status(500).json({ error: 'Internal Server Error' })

                    users.push({ username, passwordHash })
                    res.status(201).json({ message: 'User registered successfully' })
                })
            }
        )

        // Login and generate JWT
        app.post('/login', (req: Request, res: Response) => {
            const { username, password } = req.body
            const user = users.find((u) => u.username === username);

            if (!user) {
                return res.status(401).json({ message: 'Invalid credentials' })
            }

            bcrypt.compare(password, user.passwordHash, (err, result) => {
                if (err) return res.status(500).json({ error: 'Internal Server Error' })
                if (!result) return res.status(401).json({ message: 'Invalid credentials' })

                const token = jwt.sign({ username }, secret, { expiresIn: '1h' })
                res.json({ token })
            });
        });

        // Protected route
        app.get('/protected', authenticateJWT, (req: Request, res: Response) => {
            res.json({ result: true })
        })

        // default page
        app.get('/', (req: Request, res: Response) => {
            res.send('Enera VoIP Appliance')
        })

        app.get('/version', (req: Request, res: Response) => {
            res.json({ version: apiVersion })
        })

        app.get('/conf/general', async (req: Request, res: Response) => {
            const result = await this.eneraAsteriskApiServer.general(req)
            res.json(result)
        })

        app.post('/conf/general', async (req: Request, res: Response) => {
            const result = await this.eneraAsteriskApiServer.general(req)
            res.json(result)
        })

        app.listen(port, '0.0.0.0', () => {
            console.log(`Server is running on port ${port}`)
        })
    }
}