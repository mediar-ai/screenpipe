import { useWindowEventLister } from '@/modules/event-management/listener/adapters/react/window.hook'
import { ReactLogPresenterOutput } from '@/modules/screenpipe-cli/adapters/react-log.presenter'
import React, { useEffect, useRef } from 'react'
import { useState, useCallback } from 'react'
import { cn } from '../lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { opacityVisibility } from '@/lib/motion/constants';

export function useTerminalLogsDisplay() {
  const [logs, setLogs] = useState<ReactLogPresenterOutput[]>([])

  const addLog = useCallback((newLog: ReactLogPresenterOutput) => {
    setLogs((prevLogs) => [...prevLogs, newLog])
  }, [])

  const handleNewLog = useCallback((event: ReactLogPresenterOutput) => {
    if (event.message?.length && event.message.length > 0) {
      addLog(event)
    }
  },[])

  useWindowEventLister('model-download-update', handleNewLog)

  return { logs }
}

export const TerminalLogsDisplay = ({
  className
} : {
  className: string
}) => {
  const { logs } = useTerminalLogsDisplay()
  const scrollRef = useRef<any>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <motion.div
      variants={opacityVisibility}
      initial={'hidden'}
      animate={'visible'}
      exit={'hidden'}
      ref={scrollRef} 
      className={cn("max-h-[100px] overflow-scroll min-h-[100px] w-[380px] mx-auto p-2", className)}
    >
      <ul>
        <AnimatePresence>
          {logs.map((log, index) => (
              <motion.li
                key={index}
                data-type={log.level}
                className="text-[10px] truncate list-none before:content-['•'] before:mr-2 before:inline-block 
                          before:text-lg
                          before:leading-none
                          data-[type='INFO']:before:text-blue-500 
                          data-[type='ERROR']:before:text-red-500 
                          data-[type='DEBUG']:before:text-green-500"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
              >
                  {log.message}
              </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </motion.div>
  )
}

