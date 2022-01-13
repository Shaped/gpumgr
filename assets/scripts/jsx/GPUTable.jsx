class GPUTable extends React.Component {
	constructor(props) {
		super(props);
		this.sortableRef = React.createRef(); // pass this to sortable when mounted?
	}

	componentDidMount() {
		window.dispatchEvent(
			new CustomEvent('sortableComponentMounted',
				{ detail: { component: this.__proto__.constructor.name } })
		);
	}

	componentDidUpdate() {
		console.log("cDU()");
			window.dispatchEvent(
			new CustomEvent('sortableComponentMounted',
				{ detail: { component: this.__proto__.constructor.name } })
		);	
	}

	render() {
		console.log('gputable render')
		let NoGPUs = (<>
				<h2>No GPUs were found!</h2>
				<p>You can check the gpumgr log for hints, also check that your GPU drivers are correctly installed.</p>
				<p>gpumgr shouldn't need special permission to list GPUs, however, it will need <em>root</em> access to modify any settings.</p>
			</>);

		let GPUTable = (<>
			<h2>GPUs Found:</h2>
			<table className="gpuTable" ref={this.sortableRef}>
				<thead>
					<tr>
						<td>ID</td>
						<td>Vendor</td>
						<td>PCI Bus ID</td>
						<td>VendorID:DeviceID<br/>SubVendorID:SubDeviceID</td>
						<td>Type</td>
						<td>Device Name</td>
					</tr>
				</thead>
				<tbody>
					{Array.from(this.props.GPUs).map((gpu,i) => {
						return (
						<tr key={i}>
							<td>{gpu.gpu} {gpu?.nv?.nvidia_smi_log?.gpu?.fan_speed}</td>
							<td className="vendor">
						      {(() => {
						        if (gpu.vendorName != "unknown") {
									return (<img className="vendorLogo" src={"/img/vendor/" + gpu.vendorName + "-logo-sq.png"} />);
						        } else {
						        	return "Unknown";
						        }
						      })()}							
							</td>
							<td>{gpu.pcidevice}</td>
							<td>{gpu.vendorid}:{gpu.deviceid}<br/>{gpu.subvendorid}:{gpu.subdeviceid}</td>
							<td><ProductLogo ProductName={gpu.productName} /></td>
							<td>{gpu.productName}</td>
						</tr>
						);
					})}
				</tbody>
			</table>
			</>);

		return (<>
				{this.props.GPUs
					?	GPUTable
					:   NoGPUs
				}
			</>);
	}
}