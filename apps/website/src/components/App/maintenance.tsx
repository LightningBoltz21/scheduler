import React from 'react';

export default function Maintenance(): React.ReactElement {
  return (
    <div className="Maintenance">
      <div className="content">
        <div className="main-content">
          <div className="text">
            <h1>
              UIUC Scheduler is <br />
              Under Maintenance
            </h1>
            <p>
              UIUC Scheduler is currently undergoing maintenance. <br />
              We’ll resume service to assist registration and scheduling soon.
            </p>
            <p>
              We appreciate your continued support and patience. For any
              inquiries, please{' '}
              <a href="mailto: uiucschedulerapp@gmail.com">contact us</a>.
            </p>
            <p>
              —The UIUC Scheduler Team
              <br />
              <br />
            </p>
          </div>
          <img alt="UIUC Scheduler Logo" src="/mascot.png" />
        </div>
      </div>
    </div>
  );
}
