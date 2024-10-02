import React from 'react';

const fakeData = [
  { time: '08:00', event: 'Started working on project A' },
  { time: '09:00', event: 'Meeting with team' },
  { time: '10:00', event: 'Continued working on project A' },
  { time: '11:00', event: 'Break' },
  { time: '12:00', event: 'Lunch' },
  { time: '13:00', event: 'Started working on project B' },
  { time: '14:00', event: 'Meeting with client' },
  { time: '15:00', event: 'Continued working on project B' },
  { time: '16:00', event: 'Break' },
  { time: '17:00', event: 'Finished work for the day' },
];

const Timeline = () => {
  return (
    <div className="timeline-container">
      {fakeData.map((item, index) => (
        <div key={index} className="timeline-item">
          <div className="timeline-time">{item.time}</div>
          <div className="timeline-event">{item.event}</div>
        </div>
      ))}
    </div>
  );
};

export default Timeline;
