import React from 'react'

export const styles = {
	satellite: 'mapbox/satellite-v9',
	carte: 'mapbox/streets-v10',
	artistique: 'kont/ck60mhncx1z681ipczm7amthv'
}

export const Switch = ({ setStyle, style }) => (
	<div id="switch">
		{Object.keys(styles).map(key => (
			<label>
				<input
					type="radio"
					name="style"
					value={key}
					checked={style === key}
					onChange={() => setStyle(key)}
				/>
				{key}
			</label>
		))}
	</div>
)
