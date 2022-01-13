class Card extends React.Component {
	constructor(props){
		super(props);
		this.state={children:[]};
	}	
	addChild(child) {
		child.ref = React.createRef();
		child.props = this.props;		
		this.setState({
		  children: [...this.state.children, child],
		});
	}	
	render() {
		let possibleChildren = { GPUTable };
		let children=[];
		this.state.children.map((child,i) => {
			if (typeof possibleChildren[child.componentName] === 'undefined')
				throw new Error("Component not whitelisted")
			children.push(React.createElement(possibleChildren[child.componentName], {ref:child.ref, key:i, ...child.props}));
		});
		return (
			<div className="card">
				{children}
			</div>
			);
	}
}